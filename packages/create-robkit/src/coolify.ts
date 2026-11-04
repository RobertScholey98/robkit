import { install } from "@robkit/session/addresses";
import { containerPort, type Deployment, type Value } from "./deployment.ts";

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
}

const configKeys = [
  "project",
  "environment",
  "server",
  "githubApp",
  "repository",
  "branch",
  "domain",
] as const;

export function readCoolifyConfig(text: string): CoolifyConfig {
  const input = JSON.parse(text) as Record<string, unknown>;
  const config: Partial<CoolifyConfig> = {};
  for (const key of configKeys) {
    const value = input[key];
    if (typeof value !== "string" || value === "") {
      throw new Error(`coolify.json needs a non-empty string \`${key}\`.`);
    }
    config[key] = value;
  }
  return config as CoolifyConfig;
}

/** How to reach Coolify's API. */
export interface Coolify {
  url: string;
  token: string;
  /** A Cloudflare Access service token, when Access guards Coolify. */
  accessId?: string;
  accessSecret?: string;
}

type Called = { ok: true; body: unknown } | { ok: false; detail: string };

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
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
 */
async function call(
  coolify: Coolify,
  fetchImpl: typeof fetch,
  method: string,
  path: string,
  body?: unknown,
): Promise<Called> {
  const base = coolify.url.replace(/\/+$/, "");
  try {
    const response = await fetchImpl(`${base}/api/v1${path}`, {
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
    });
    const raw = await response.text();
    if (!response.ok) {
      return { ok: false, detail: `HTTP ${String(response.status)} ${raw}` };
    }
    try {
      return { ok: true, body: JSON.parse(raw) as unknown };
    } catch {
      return {
        ok: false,
        detail: `HTTP ${String(response.status)} with a body that isn't JSON`,
      };
    }
  } catch (error) {
    return { ok: false, detail: describeError(error) };
  }
}

async function get(
  coolify: Coolify,
  fetchImpl: typeof fetch,
  path: string,
): Promise<unknown> {
  const result = await call(coolify, fetchImpl, "GET", path);
  if (!result.ok) throw new Error(`GET ${path} failed: ${result.detail}`);
  return result.body;
}

/** One application as the install wants it on Coolify. */
interface Desired {
  slug: string;
  settings: Record<string, string | boolean>;
  envs: {
    key: string;
    value: string;
    is_buildtime: boolean;
    is_runtime: true;
  }[];
}

function valueOf(value: Value): string {
  return "literal" in value ? value.literal : `{{environment.${value.shared}}}`;
}

function desiredApp({ slug, env }: Deployment, config: CoolifyConfig): Desired {
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
    throw new Error(
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
  throw new Error(`No Coolify ${kind} named ${name}. Found: ${names}.`);
}

type Synced =
  | { slug: string; action: "created" | "synced"; uuid: string }
  | { slug: string; action: "failed"; detail: string };

/**
 * Creates any application Coolify lacks, and brings every application's
 * settings and variables in line with the install. Variables Coolify holds
 * that the install doesn't name are left alone.
 */
async function syncApps(
  coolify: Coolify,
  fetchImpl: typeof fetch,
  config: CoolifyConfig,
  desired: Desired[],
): Promise<Synced[]> {
  const [projects, servers, githubApps, applications] = await Promise.all(
    ["/projects", "/servers", "/github-apps", "/applications"].map((path) =>
      get(coolify, fetchImpl, path),
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
      ? await call(
          coolify,
          fetchImpl,
          "PATCH",
          `/applications/${found}`,
          app.settings,
        )
      : await call(
          coolify,
          fetchImpl,
          "POST",
          "/applications/private-github-app",
          {
            ...target,
            instant_deploy: false,
            ...app.settings,
          },
        );
    const uuid = found ?? (saved.ok ? text(saved.body, "uuid") : undefined);
    if (!saved.ok || !uuid) {
      const detail = saved.ok ? "Coolify returned no uuid" : saved.detail;
      results.push({
        slug: app.slug,
        action: "failed",
        detail: `${found ? "update" : "create"}: ${detail}`,
      });
      continue;
    }
    const envs = await call(
      coolify,
      fetchImpl,
      "PATCH",
      `/applications/${uuid}/envs/bulk`,
      { data: app.envs },
    );
    results.push(
      envs.ok
        ? { slug: app.slug, action: found ? "synced" : "created", uuid }
        : {
            slug: app.slug,
            action: "failed",
            detail: `variables: ${envs.detail}`,
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
function plan(affected: string[] | "all", synced: Synced[]): Step[] {
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

/** Queues a deploy of `uuid`, then polls it until Coolify says it ended. */
async function deployAndWait(
  coolify: Coolify,
  fetchImpl: typeof fetch,
  uuid: string,
  { intervalMs, timeoutMs }: WaitOptions,
): Promise<{ ok: boolean; detail: string }> {
  const queued = await call(
    coolify,
    fetchImpl,
    "POST",
    `/deploy?uuid=${encodeURIComponent(uuid)}`,
  );
  if (!queued.ok) return queued;
  const deployments = field(queued.body, "deployments");
  const first: unknown = Array.isArray(deployments)
    ? deployments[0]
    : undefined;
  const deployment = text(first, "deployment_uuid");
  // Coolify answers 200 even when it queued nothing.
  if (deployment === undefined) {
    return {
      ok: false,
      detail: `Coolify queued nothing: ${text(first, "message") ?? JSON.stringify(queued.body)}`,
    };
  }

  const deadline = Date.now() + timeoutMs;
  let last = "queued";
  let misses = 0;
  for (;;) {
    const result = await call(
      coolify,
      fetchImpl,
      "GET",
      `/deployments/${encodeURIComponent(deployment)}`,
    );
    if (result.ok) {
      misses = 0;
      last = text(result.body, "status") ?? last;
      if (last === "finished") return { ok: true, detail: "finished" };
      if (last === "failed" || last === "cancelled-by-user") {
        return { ok: false, detail: last };
      }
    } else if (++misses >= 3) {
      return {
        ok: false,
        detail: `lost track of ${deployment}: ${result.detail}`,
      };
    }
    if (Date.now() >= deadline) {
      return {
        ok: false,
        detail: `still ${last} after ${String(Math.round(timeoutMs / 60_000))} minutes`,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export interface DeployOptions {
  coolify: Coolify;
  config: CoolifyConfig;
  deployments: Deployment[];
  /** The apps whose code changed, by slug, or every app. */
  affected: string[] | "all";
  fetch?: typeof fetch;
  log?: (line: string) => void;
  intervalMs?: number;
  timeoutMs?: number;
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
}: DeployOptions): Promise<boolean> {
  const synced = await syncApps(
    coolify,
    fetchImpl,
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
        ...(await deployAndWait(coolify, fetchImpl, uuid, {
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
