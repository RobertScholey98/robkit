import { setTimeout as sleep } from "node:timers/promises";
import type { Slug } from "@robkit/input";
import { install } from "@robkit/input/addresses";
import {
  callCoolify,
  whatToCheck,
  describeDuration,
  describeFailure,
  fieldOf,
  stringFieldOf,
  type CoolifyApi,
  type Coolify,
} from "./coolify-api.ts";
import type { CoolifyConfig } from "./coolify-config.ts";
import {
  findApp,
  readHost,
  sharedVariablesOf,
  type Host,
} from "./coolify-host.ts";
import { readRecord, recordOf, variablesHash } from "./coolify-record.ts";
import type { Changes, History } from "./affected-apps.ts";
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
  host: Host,
  desired: Desired[],
): Promise<Synced[]> {
  const results: Synced[] = [];
  for (const app of desired) {
    const found = stringFieldOf(
      findApp(host, String(app.settings.name)),
      "uuid",
    );
    const saved = found
      ? await callCoolify(api, "PATCH", `/applications/${found}`, {
          body: app.settings,
        })
      : await callCoolify(api, "POST", "/applications/private-github-app", {
          body: { ...host.target, instant_deploy: false, ...app.settings },
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

/** Which apps a deploy considers deploying. */
export type Choice =
  | "changed"
  | "all"
  /** The apps named with `--apps`. */
  | readonly Slug[];

/** Whether an app deploys in this run, and why, before anything is written. */
interface Decision {
  deploy: boolean;
  reason: string;
}

function short(commit: string): string {
  return commit.slice(0, 7);
}

/**
 * What an app's record says about it. A record that is missing or can't be
 * read never proves the app unchanged, nor does a commit gone from history.
 */
async function fromRecord(
  app: Desired,
  existing: unknown,
  history: History,
  changes: (commit: string) => Promise<Changes>,
  { variablesOnly }: { variablesOnly: boolean },
): Promise<Decision> {
  const record = readRecord(fieldOf(existing, "description"));
  if (record.outcome === "none") {
    return { deploy: true, reason: "no record of a finished deploy" };
  }
  if (record.outcome === "unreadable") {
    return { deploy: true, reason: "its record can't be read" };
  }
  const since = short(record.commit);
  if (record.variables !== variablesHash(app.envs)) {
    return { deploy: true, reason: `its variables changed since ${since}` };
  }
  if (variablesOnly) {
    return { deploy: false, reason: "not named with --apps" };
  }
  if (record.commit === history.head) {
    return { deploy: false, reason: `unchanged since ${since}` };
  }
  const changed = await changes(record.commit);
  if (changed.outcome === "not-in-history") {
    return {
      deploy: true,
      reason: `${since} is no longer in the branch's history`,
    };
  }
  return changed.apps.includes(app.slug)
    ? { deploy: true, reason: `changed since ${since}` }
    : { deploy: false, reason: `unchanged since ${since}` };
}

/**
 * Decides, from what Coolify holds, which apps deploy. A new app always
 * does. With `--apps`, the apps named do, and core does when its record
 * doesn't show the variables it is about to get, since core gives the apps
 * their databases. Otherwise each app's record decides, and turbo is asked
 * once for each distinct recorded commit.
 */
async function decide(
  choice: Choice,
  desired: readonly Desired[],
  host: Host,
  history: History,
): Promise<Decision[]> {
  const asked = new Map<string, Promise<Changes>>();
  const changes = (commit: string): Promise<Changes> => {
    const known = asked.get(commit) ?? history.changedSince(commit);
    asked.set(commit, known);
    return known;
  };
  return Promise.all(
    desired.map(async (app): Promise<Decision> => {
      const existing = findApp(host, String(app.settings.name));
      if (existing === undefined) {
        return { deploy: true, reason: "new on Coolify" };
      }
      if (choice === "all") return { deploy: true, reason: "--all" };
      if (choice === "changed") {
        return fromRecord(app, existing, history, changes, {
          variablesOnly: false,
        });
      }
      if (choice.includes(app.slug)) {
        return { deploy: true, reason: "named with --apps" };
      }
      if (app.slug !== "core") {
        return { deploy: false, reason: "not named with --apps" };
      }
      return fromRecord(app, existing, history, changes, {
        variablesOnly: true,
      });
    }),
  );
}

type Step =
  | {
      app: string;
      action: "deploy";
      uuid: string;
      reason: string;
      record: string;
    }
  | { app: string; action: "skip" | "failed"; reason: string };

/** Each app's step: what was decided, unless its sync failed. */
function plan(
  desired: readonly Desired[],
  decisions: readonly Decision[],
  synced: readonly Synced[],
  commit: string,
): Step[] {
  return synced.map((result, index): Step => {
    const app = result.slug;
    const decision = decisions[index];
    const wanted = desired[index];
    if (result.action === "failed") {
      return { app, action: "failed", reason: result.detail };
    }
    if (!decision?.deploy || !wanted) {
      return { app, action: "skip", reason: decision?.reason ?? "" };
    }
    return {
      app,
      action: "deploy",
      uuid: result.uuid,
      reason: decision.reason,
      record: recordOf(commit, variablesHash(wanted.envs)),
    };
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
  /** Which apps to consider: those changed since their record, all, or the apps named. */
  apps: Choice;
  /** The checkout robkit runs from, and what changed in it since a commit. */
  history: History;
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
  apps,
  history,
  fetch: fetchImpl = fetch,
  log = console.log,
  intervalMs = 10_000,
  timeoutMs = 20 * 60_000,
  requestTimeoutMs = 30_000,
}: DeployOptions): Promise<boolean> {
  const api: CoolifyApi = { coolify, fetch: fetchImpl, requestTimeoutMs };
  const desired = deployments.map((deployment) =>
    desiredApp(deployment, config),
  );
  const host = await readHost(api, config, sharedVariablesOf(deployments));
  const decisions = await decide(apps, desired, host, history);
  const synced = await syncApps(api, host, desired);
  const steps = plan(desired, decisions, synced, history.head);
  log("| App | Action | Detail |");
  log("| --- | --- | --- |");
  for (const { app, action, reason } of steps) {
    log(`| ${app} | ${action} | ${reason} |`);
  }
  let ok = steps.every(({ action }) => action !== "failed");

  const planned = waves(
    steps.flatMap((step) => (step.action === "deploy" ? [step] : [])),
  );
  for (const [index, wave] of planned.entries()) {
    const outcomes = await Promise.all(
      wave.map(async ({ app, uuid, record }) => {
        const deployed = await deployAndWait(api, uuid, {
          intervalMs,
          timeoutMs,
        });
        if (!deployed.ok) {
          log(`- ${app}: failed, ${deployed.detail}`);
          return deployed;
        }
        const saved = await callCoolify(api, "PATCH", `/applications/${uuid}`, {
          body: { description: record },
        });
        if (saved.outcome === "failed") {
          log(
            `- ${app}: deployed, but its record wasn't saved, so the next deploy deploys it again: ${describeFailure(saved)}`,
          );
          // The app runs, so the rest can follow, but the command fails.
          ok = false;
          return deployed;
        }
        log(`- ${app}: deployed, ${deployed.detail}`);
        return deployed;
      }),
    );
    if (outcomes.every(({ ok: deployed }) => deployed)) continue;
    for (const { app } of planned.slice(index + 1).flat()) {
      log(`- ${app}: not started, an earlier deploy failed`);
    }
    return false;
  }
  return ok;
}
