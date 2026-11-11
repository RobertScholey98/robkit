import { setTimeout as sleep } from "node:timers/promises";
import { CommandProblem } from "@robkit/dev/cli";
import type { Slug } from "@robkit/input";
import { install } from "@robkit/input/addresses";
import {
  callCoolify,
  whatToCheck,
  describeDuration,
  describeFailure,
  fieldOf,
  readFromCoolify,
  stringFieldOf,
  type CoolifyApi,
  type Coolify,
} from "./coolify-api.ts";
import type { CoolifyConfig } from "./coolify-config.ts";
import {
  containerPort,
  type AppDeployment,
  type DeploymentValue,
} from "./deployment.ts";

// robkit deploy: R's Coolify method, adapted from robnet's deploy job. Each
// app is a Coolify application built from the install's one Dockerfile. A
// deploy brings every application's settings and variables in line with the
// install, then deploys core and the apps that changed.

/** One application as the install wants it on Coolify. */
interface Desired {
  slug: Slug;
  settings: Record<string, string | boolean>;
  envs: {
    key: string;
    value: string;
    is_buildtime: boolean;
    is_runtime: true;
  }[];
}

function valueOf(value: DeploymentValue): string {
  return "literal" in value ? value.literal : `{{environment.${value.shared}}}`;
}

function desiredApp(
  { slug, env }: AppDeployment,
  config: CoolifyConfig,
): Desired {
  const port = String(containerPort);
  return {
    slug,
    settings: {
      name: `${config.project}-${slug}`,
      // Cloudflare terminates TLS and its tunnel carries plain http to
      // Traefik, so an https domain here would redirect forever.
      domains: `http://${install({ domain: config.domain }).host(slug)}`,
      git_repository: config.repository,
      git_branch: config.branch,
      build_pack: "dockerfile",
      base_directory: "/",
      dockerfile_location: "/Dockerfile",
      ports_exposes: port,
      // The Dockerfile's HEALTHCHECK judges each container.
      health_check_enabled: false,
      is_auto_deploy_enabled: false,
      is_force_https_enabled: false,
    },
    envs: Object.entries(env).map(([key, value]) => ({
      key,
      value: valueOf(value),
      // The Dockerfile takes ROBKIT_APP as a build argument.
      is_buildtime: key === "ROBKIT_APP",
      is_runtime: true,
    })),
  };
}

function normalizeRepo(repository: string): string {
  return repository
    .toLowerCase()
    .replace(/^(https?:\/\/github\.com\/|git@github\.com:)/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

/**
 * The Coolify application already running `desired` from this repository,
 * so one made by hand is adopted rather than duplicated. Every app builds
 * the same Dockerfile, so its name tells them apart.
 */
function findApp(
  applications: unknown[],
  desired: Desired,
): string | undefined {
  const repo = normalizeRepo(String(desired.settings.git_repository));
  const matches = applications.filter(
    (app) =>
      normalizeRepo(stringFieldOf(app, "git_repository") ?? "") === repo &&
      stringFieldOf(app, "name") === desired.settings.name,
  );
  if (matches.length > 1) {
    throw new CommandProblem(
      `${String(matches.length)} Coolify applications are named ${String(desired.settings.name)}. Delete the extras.`,
    );
  }
  return stringFieldOf(matches[0], "uuid");
}

function pick(list: unknown, name: string, kind: string): string {
  const items: unknown[] = Array.isArray(list) ? list : [];
  const chosen =
    items.find((item) => stringFieldOf(item, "name") === name) ??
    (items.length === 1 ? items[0] : undefined);
  const uuid = stringFieldOf(chosen, "uuid");
  if (uuid) return uuid;
  const names =
    items.map((item) => stringFieldOf(item, "name") ?? "?").join(", ") ||
    "none";
  throw new CommandProblem(
    `No Coolify ${kind} named ${name}. Found: ${names}.`,
  );
}

/**
 * The id of the configured environment in the project, which each of its
 * applications names as its `environment_id`.
 */
async function environmentId(
  api: CoolifyApi,
  project: string,
  config: CoolifyConfig,
): Promise<unknown> {
  const listed = await readFromCoolify(
    api,
    `/projects/${encodeURIComponent(project)}/environments`,
  );
  const environments: unknown[] = Array.isArray(listed) ? listed : [];
  const found = environments.find(
    (environment) => stringFieldOf(environment, "name") === config.environment,
  );
  const id = fieldOf(found, "id");
  if (id !== undefined) return id;
  const names =
    environments
      .map((environment) => stringFieldOf(environment, "name") ?? "?")
      .join(", ") || "none";
  throw new CommandProblem(
    `The Coolify project ${config.project} has no environment named ${config.environment}. Found: ${names}.`,
  );
}

type Synced =
  | { slug: Slug; action: "created" | "synced"; uuid: string }
  | { slug: Slug; action: "failed"; detail: string };

/**
 * Creates any application Coolify lacks, and brings every application's
 * settings and variables in line with the install. Variables Coolify holds
 * that the install doesn't name are left alone.
 */
async function syncApps(
  api: CoolifyApi,
  config: CoolifyConfig,
  desired: Desired[],
): Promise<Synced[]> {
  const [projects, servers, githubApps, applications] = await Promise.all(
    ["/projects", "/servers", "/github-apps", "/applications"].map((path) =>
      readFromCoolify(api, path),
    ),
  );
  const target = {
    project_uuid: pick(projects, config.project, "project"),
    server_uuid: pick(servers, config.server, "server"),
    github_app_uuid: pick(githubApps, config.githubApp, "GitHub App"),
    environment_name: config.environment,
  };
  const environment = await environmentId(api, target.project_uuid, config);
  // The token lists every application of its team, so keep to this
  // install's environment.
  const existing = (Array.isArray(applications) ? applications : []).filter(
    (app: unknown) => fieldOf(app, "environment_id") === environment,
  );

  const results: Synced[] = [];
  for (const app of desired) {
    const found = findApp(existing, app);
    const saved = found
      ? await callCoolify(api, "PATCH", `/applications/${found}`, {
          body: app.settings,
        })
      : await callCoolify(api, "POST", "/applications/private-github-app", {
          body: { ...target, instant_deploy: false, ...app.settings },
        });
    const uuid =
      found ??
      (saved.outcome === "answered"
        ? stringFieldOf(saved.body, "uuid")
        : undefined);
    if (saved.outcome === "failed" || !uuid) {
      const failure =
        saved.outcome === "answered"
          ? { detail: "Coolify returned no uuid", check: whatToCheck.coolify }
          : saved;
      results.push({
        slug: app.slug,
        action: "failed",
        detail: `${found ? "updating it" : "creating it"}: ${describeFailure(failure)}`,
      });
      continue;
    }
    const envs = await callCoolify(
      api,
      "PATCH",
      `/applications/${uuid}/envs/bulk`,
      {
        body: { data: app.envs },
      },
    );
    results.push(
      envs.outcome === "answered"
        ? { slug: app.slug, action: found ? "synced" : "created", uuid }
        : {
            slug: app.slug,
            action: "failed",
            detail: `saving its variables: ${describeFailure(envs)}`,
          },
    );
  }
  return results;
}

type Step =
  | { app: string; action: "deploy"; uuid: string; reason: string }
  | { app: string; action: "skip" | "failed"; reason: string };

/**
 * Deploys each affected app and each app new on Coolify. A new app also
 * changes core's catalog and the apps it provisions, so core deploys too.
 */
function plan(affected: readonly Slug[] | "all", synced: Synced[]): Step[] {
  const catalogChanged = synced.some(({ action }) => action === "created");
  return synced.map((result): Step => {
    const app = result.slug;
    if (result.action === "failed") {
      return { app, action: "failed", reason: result.detail };
    }
    const deploy = (reason: string): Step => ({
      app,
      action: "deploy",
      uuid: result.uuid,
      reason,
    });
    if (result.action === "created") return deploy("new on Coolify");
    if (affected === "all" || affected.includes(app)) return deploy("changed");
    if (app === "core" && catalogChanged) {
      return deploy("the app catalog changed");
    }
    return { app, action: "skip", reason: "unchanged" };
  });
}

/**
 * Core provisions every app's database as it starts, so it goes first and
 * the rest follow together.
 */
function waves<T extends { app: string }>(deploys: T[]): T[][] {
  const first = deploys.filter(({ app }) => app === "core");
  const rest = deploys.filter(({ app }) => app !== "core");
  return [first, rest].filter((wave) => wave.length > 0);
}

interface WaitOptions {
  intervalMs: number;
  timeoutMs: number;
}

/**
 * Queues a deploy of `uuid`, then polls it until Coolify says it ended. The
 * deadline bounds the whole wait, a request in flight included.
 */
async function deployAndWait(
  api: CoolifyApi,
  uuid: string,
  { intervalMs, timeoutMs }: WaitOptions,
): Promise<{ ok: boolean; detail: string }> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const queued = await callCoolify(
    api,
    "POST",
    `/deploy?uuid=${encodeURIComponent(uuid)}`,
    { deadline },
  );
  if (queued.outcome === "failed") {
    return {
      ok: false,
      detail: `queueing its deploy: ${describeFailure(queued)}`,
    };
  }
  const deployments = fieldOf(queued.body, "deployments");
  const first: unknown = Array.isArray(deployments)
    ? deployments[0]
    : undefined;
  const deployment = stringFieldOf(first, "deployment_uuid");
  // Coolify answers 200 even when it queued nothing.
  if (deployment === undefined) {
    return {
      ok: false,
      detail: `Coolify queued nothing: ${stringFieldOf(first, "message") ?? JSON.stringify(queued.body)}. ${whatToCheck.coolify}`,
    };
  }

  let last = "queued";
  let misses = 0;
  for (;;) {
    const result = await callCoolify(
      api,
      "GET",
      `/deployments/${encodeURIComponent(deployment)}`,
      { deadline },
    );
    if (deadline.aborted) {
      return {
        ok: false,
        detail: `still ${last} after ${describeDuration(timeoutMs)}. ${whatToCheck.deployment}`,
      };
    }
    if (result.outcome === "answered") {
      misses = 0;
      last = stringFieldOf(result.body, "status") ?? last;
      if (last === "finished") return { ok: true, detail: "finished" };
      if (last === "failed" || last === "cancelled-by-user") {
        return { ok: false, detail: `${last}. ${whatToCheck.deployment}` };
      }
    } else if (++misses >= 3) {
      return {
        ok: false,
        detail: `lost track of ${deployment}: ${describeFailure(result)}`,
      };
    }
    // The deadline cutting the sleep short ends the wait: the next turn says so.
    await sleep(intervalMs, undefined, { signal: deadline }).catch(
      () => undefined,
    );
  }
}

export interface DeployOptions {
  coolify: Coolify;
  config: CoolifyConfig;
  deployments: AppDeployment[];
  /** The apps whose code changed, by slug, or every app. */
  affected: readonly Slug[] | "all";
  fetch?: typeof fetch;
  log?: (line: string) => void;
  /** How long to wait between polls of a deployment. */
  intervalMs?: number;
  /** How long one app's deploy may take, from queueing it to its end. */
  timeoutMs?: number;
  /** How long one request to Coolify may take. */
  requestTimeoutMs?: number;
}

/**
 * Brings Coolify in line with the install and deploys what changed: core
 * first, then the rest. Logs the plan as a Markdown table, then each
 * deploy's outcome.
 *
 * @returns whether every step succeeded
 */
export async function deploy({
  coolify,
  config,
  deployments,
  affected,
  fetch: fetchImpl = fetch,
  log = console.log,
  intervalMs = 10_000,
  timeoutMs = 20 * 60_000,
  requestTimeoutMs = 30_000,
}: DeployOptions): Promise<boolean> {
  const api: CoolifyApi = { coolify, fetch: fetchImpl, requestTimeoutMs };
  const synced = await syncApps(
    api,
    config,
    deployments.map((deployment) => desiredApp(deployment, config)),
  );
  const steps = plan(affected, synced);
  log("| App | Action | Detail |");
  log("| --- | --- | --- |");
  for (const { app, action, reason } of steps) {
    log(`| ${app} | ${action} | ${reason} |`);
  }
  const ok = steps.every(({ action }) => action !== "failed");

  const planned = waves(
    steps.flatMap((step) => (step.action === "deploy" ? [step] : [])),
  );
  for (const [index, wave] of planned.entries()) {
    const outcomes = await Promise.all(
      wave.map(async ({ app, uuid }) => ({
        app,
        ...(await deployAndWait(api, uuid, {
          intervalMs,
          timeoutMs,
        })),
      })),
    );
    for (const { app, ok: deployed, detail } of outcomes) {
      log(`- ${app}: ${deployed ? "deployed" : "failed"}, ${detail}`);
    }
    if (outcomes.every(({ ok: deployed }) => deployed)) continue;
    for (const { app } of planned.slice(index + 1).flat()) {
      log(`- ${app}: not started, an earlier deploy failed`);
    }
    return false;
  }
  return ok;
}
