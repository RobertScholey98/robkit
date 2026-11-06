import { setTimeout as sleep } from "node:timers/promises";
import { CommandProblem } from "@robkit/dev/cli";
import { install, type Slug } from "@robkit/session/addresses";
import {
  isDomain,
  isProblem,
  isRecord,
  type InputProblem,
} from "@robkit/session/input";
import {
  containerPort,
  type AppDeployment,
  type TrustedProxy,
  type DeploymentValue,
} from "./deployment.ts";

// robkit deploy: R's Coolify method, adapted from robnet's deploy job. Each
// app is a Coolify application built from the install's one Dockerfile. A
// deploy brings every application's settings and variables in line with the
// install, then deploys core and the apps that changed.

/** Where the install deploys: `coolify.json` at its root. */
export interface CoolifyConfig {
  project: string;
  environment: string;
  server: string;
  /** The GitHub App Coolify builds the repository through. */
  githubApp: string;
  /** The install's repository, such as `owner/name`. */
  repository: string;
  branch: string;
  /** The domain the install answers on, such as `robkit.dev`. */
  domain: string;
  /** `cloudflare` when only a Cloudflare tunnel reaches the host. */
  trustedProxy?: TrustedProxy;
}

/** What each of coolify.json's settings holds, for a problem to name. */
const settings = {
  project: "the Coolify project's name",
  environment: "the project's environment, such as production",
  server: "the Coolify server's name, such as localhost",
  githubApp: "the GitHub App Coolify builds the repository through",
  repository: "the install's repository, such as owner/name",
  branch: "the branch to deploy, such as main",
  domain: "the domain the install answers on, such as robkit.dev",
} as const;

/** `coolify.json`, read from its parsed JSON. */
export function readCoolifyConfig(
  value: unknown,
): CoolifyConfig | InputProblem {
  if (!isRecord(value)) {
    return {
      error:
        "coolify.json must be a JSON object with project, environment, server, githubApp, repository, branch and domain. See docs/deploy.md.",
    };
  }
  const text = (key: keyof typeof settings): string | InputProblem => {
    const found = value[key];
    return typeof found === "string" && found !== ""
      ? found
      : {
          error: `coolify.json: ${key} must be a non-empty string: ${settings[key]}.`,
        };
  };
  const project = text("project");
  const environment = text("environment");
  const server = text("server");
  const githubApp = text("githubApp");
  const repository = text("repository");
  const branch = text("branch");
  const domain = text("domain");
  if (isProblem(project)) return project;
  if (isProblem(environment)) return environment;
  if (isProblem(server)) return server;
  if (isProblem(githubApp)) return githubApp;
  if (isProblem(repository)) return repository;
  if (isProblem(branch)) return branch;
  if (isProblem(domain)) return domain;
  if (!isDomain(domain)) {
    return {
      error: `coolify.json: domain is "${domain}", which isn't a domain. Set it to the domain the install answers on alone, such as robkit.dev.`,
    };
  }
  const { trustedProxy } = value;
  if (trustedProxy !== undefined && trustedProxy !== "cloudflare") {
    return {
      error:
        'coolify.json: trustedProxy must be "cloudflare", when only a Cloudflare tunnel reaches the host, or left out.',
    };
  }
  return {
    project,
    environment,
    server,
    githubApp,
    repository,
    branch,
    domain,
    ...(trustedProxy && { trustedProxy }),
  };
}

/** How to reach Coolify's API. */
export interface Coolify {
  url: string;
  token: string;
  /** A Cloudflare Access service token, when Access guards Coolify. */
  accessId?: string;
  accessSecret?: string;
}

/** Coolify's API as one deploy reaches it. */
interface Api {
  coolify: Coolify;
  fetch: typeof fetch;
  /** How long one request may take before the deploy gives up on it. */
  requestTimeoutMs: number;
}

/** A call's answer, or what went wrong and what to check. */
type Called =
  { ok: true; body: unknown } | { ok: false; detail: string; check: string };

const checks = {
  reach: "Check COOLIFY_URL and that Coolify is up.",
  token: "Check COOLIFY_TOKEN, and that it may deploy.",
  access:
    "Check CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET: Cloudflare Access sends a token it refuses to its login page.",
  page: "Check that COOLIFY_URL is Coolify's own address.",
  coolify: "Check Coolify's own log.",
  deployment: "Check the deployment's log in Coolify.",
} as const;

/** What to check when Coolify answers `status`. */
function checkFor(status: number): string {
  if (status >= 300 && status < 400) return checks.access;
  if (status === 401 || status === 403) return checks.token;
  return checks.coolify;
}

/** A failed call as one sentence and what to check. */
function explain(called: { detail: string; check: string }): string {
  return `${called.detail}. ${called.check}`;
}

function duration(ms: number): string {
  if (ms < 1000) return `${String(ms)} ms`;
  if (ms < 60_000) return `${String(Math.round(ms / 1000))} seconds`;
  return `${String(Math.round(ms / 60_000))} minutes`;
}

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function text(value: unknown, key: string): string | undefined {
  const found = field(value, key);
  return typeof found === "string" ? found : undefined;
}

function describeError(error: unknown): string {
  const { message, cause } =
    error instanceof Error ? error : new Error(String(error));
  return cause instanceof Error ? `${message}, ${cause.message}` : message;
}

/**
 * Calls the Coolify API. A redirect counts as a failure, because Cloudflare
 * Access answers a rejected service token with a redirect to its login page.
 * Each call gives up after `api.requestTimeoutMs`, or when `deadline`
 * aborts, whichever comes first.
 */
async function call(
  api: Api,
  method: string,
  path: string,
  { body, deadline }: { body?: unknown; deadline?: AbortSignal } = {},
): Promise<Called> {
  const { coolify } = api;
  const base = coolify.url.replace(/\/+$/, "");
  const timeout = AbortSignal.timeout(api.requestTimeoutMs);
  try {
    const response = await api.fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${coolify.token}`,
        Accept: "application/json",
        ...(coolify.accessId &&
          coolify.accessSecret && {
            "CF-Access-Client-Id": coolify.accessId,
            "CF-Access-Client-Secret": coolify.accessSecret,
          }),
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
      redirect: "manual",
      signal: deadline ? AbortSignal.any([timeout, deadline]) : timeout,
    });
    const raw = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        detail: `HTTP ${String(response.status)} ${raw}`,
        check: checkFor(response.status),
      };
    }
    try {
      const body: unknown = JSON.parse(raw);
      return { ok: true, body };
    } catch {
      // A body that isn't JSON comes from something in front of Coolify,
      // and the parser's own message adds nothing.
      return {
        ok: false,
        detail: `HTTP ${String(response.status)} with a body that isn't JSON`,
        check: checks.page,
      };
    }
  } catch (error) {
    const detail = timeout.aborted
      ? `no answer in ${duration(api.requestTimeoutMs)}`
      : describeError(error);
    return { ok: false, detail, check: checks.reach };
  }
}

async function get(api: Api, path: string): Promise<unknown> {
  const result = await call(api, "GET", path);
  if (!result.ok) {
    throw new CommandProblem(
      `Couldn't read Coolify's ${path.slice(1)}: ${explain(result)}`,
    );
  }
  return result.body;
}

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
      normalizeRepo(text(app, "git_repository") ?? "") === repo &&
      text(app, "name") === desired.settings.name,
  );
  if (matches.length > 1) {
    throw new CommandProblem(
      `${String(matches.length)} Coolify applications are named ${String(desired.settings.name)}. Delete the extras.`,
    );
  }
  return text(matches[0], "uuid");
}

function pick(list: unknown, name: string, kind: string): string {
  const items: unknown[] = Array.isArray(list) ? list : [];
  const chosen =
    items.find((item) => text(item, "name") === name) ??
    (items.length === 1 ? items[0] : undefined);
  const uuid = text(chosen, "uuid");
  if (uuid) return uuid;
  const names =
    items.map((item) => text(item, "name") ?? "?").join(", ") || "none";
  throw new CommandProblem(
    `No Coolify ${kind} named ${name}. Found: ${names}.`,
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
  api: Api,
  config: CoolifyConfig,
  desired: Desired[],
): Promise<Synced[]> {
  const [projects, servers, githubApps, applications] = await Promise.all(
    ["/projects", "/servers", "/github-apps", "/applications"].map((path) =>
      get(api, path),
    ),
  );
  const target = {
    project_uuid: pick(projects, config.project, "project"),
    server_uuid: pick(servers, config.server, "server"),
    github_app_uuid: pick(githubApps, config.githubApp, "GitHub App"),
    environment_name: config.environment,
  };
  const existing: unknown[] = Array.isArray(applications) ? applications : [];

  const results: Synced[] = [];
  for (const app of desired) {
    const found = findApp(existing, app);
    const saved = found
      ? await call(api, "PATCH", `/applications/${found}`, {
          body: app.settings,
        })
      : await call(api, "POST", "/applications/private-github-app", {
          body: { ...target, instant_deploy: false, ...app.settings },
        });
    const uuid = found ?? (saved.ok ? text(saved.body, "uuid") : undefined);
    if (!saved.ok || !uuid) {
      const failure = saved.ok
        ? { detail: "Coolify returned no uuid", check: checks.coolify }
        : saved;
      results.push({
        slug: app.slug,
        action: "failed",
        detail: `${found ? "updating it" : "creating it"}: ${explain(failure)}`,
      });
      continue;
    }
    const envs = await call(api, "PATCH", `/applications/${uuid}/envs/bulk`, {
      body: { data: app.envs },
    });
    results.push(
      envs.ok
        ? { slug: app.slug, action: found ? "synced" : "created", uuid }
        : {
            slug: app.slug,
            action: "failed",
            detail: `saving its variables: ${explain(envs)}`,
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
  api: Api,
  uuid: string,
  { intervalMs, timeoutMs }: WaitOptions,
): Promise<{ ok: boolean; detail: string }> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const queued = await call(
    api,
    "POST",
    `/deploy?uuid=${encodeURIComponent(uuid)}`,
    { deadline },
  );
  if (!queued.ok) {
    return { ok: false, detail: `queueing its deploy: ${explain(queued)}` };
  }
  const deployments = field(queued.body, "deployments");
  const first: unknown = Array.isArray(deployments)
    ? deployments[0]
    : undefined;
  const deployment = text(first, "deployment_uuid");
  // Coolify answers 200 even when it queued nothing.
  if (deployment === undefined) {
    return {
      ok: false,
      detail: `Coolify queued nothing: ${text(first, "message") ?? JSON.stringify(queued.body)}. ${checks.coolify}`,
    };
  }

  let last = "queued";
  let misses = 0;
  for (;;) {
    const result = await call(
      api,
      "GET",
      `/deployments/${encodeURIComponent(deployment)}`,
      { deadline },
    );
    if (deadline.aborted) {
      return {
        ok: false,
        detail: `still ${last} after ${duration(timeoutMs)}. ${checks.deployment}`,
      };
    }
    if (result.ok) {
      misses = 0;
      last = text(result.body, "status") ?? last;
      if (last === "finished") return { ok: true, detail: "finished" };
      if (last === "failed" || last === "cancelled-by-user") {
        return { ok: false, detail: `${last}. ${checks.deployment}` };
      }
    } else if (++misses >= 3) {
      return {
        ok: false,
        detail: `lost track of ${deployment}: ${explain(result)}`,
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
  const api: Api = { coolify, fetch: fetchImpl, requestTimeoutMs };
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
