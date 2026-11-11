import { CommandProblem } from "@robkit/dev/cli";
import {
  fieldOf,
  readFromCoolify,
  stringFieldOf,
  type CoolifyApi,
} from "./coolify-api.ts";
import type { CoolifyConfig } from "./coolify-config.ts";
import { whereToFind, type AppDeployment } from "./deployment.ts";

// What robkit deploy looks up on Coolify before it writes anything.

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

/**
 * Refuses, before anything is written, an environment that lacks a shared
 * variable an app refers to. It reads their names alone: a token that may
 * read values gets them too, and none is ever printed.
 */
async function requireSharedVariables(
  api: CoolifyApi,
  project: string,
  config: CoolifyConfig,
  needed: readonly string[],
): Promise<void> {
  const listed = await readFromCoolify(
    api,
    `/projects/${encodeURIComponent(project)}/environments/${encodeURIComponent(config.environment)}/envs`,
  );
  const held = new Set(
    (Array.isArray(listed) ? listed : []).map((variable: unknown) =>
      stringFieldOf(variable, "key"),
    ),
  );
  const missing = needed.filter((name) => !held.has(name));
  if (missing.length === 0) return;
  throw new CommandProblem(
    [
      `Coolify's ${config.environment} environment lacks shared variables the apps need, so nothing was deployed:`,
      ...missing.map((name) => {
        const where = whereToFind(name);
        return where ? `- ${name}: ${where}.` : `- ${name}`;
      }),
      "Add each to the environment's shared variables in Coolify, then deploy again.",
    ].join("\n"),
  );
}

/** The host's shared variables the apps refer to, each once. */
export function sharedVariablesOf(
  deployments: readonly AppDeployment[],
): string[] {
  const names = deployments.flatMap(({ env }) =>
    Object.values(env).flatMap((value) =>
      "shared" in value ? [value.shared] : [],
    ),
  );
  return [...new Set(names)];
}

/** What robkit deploy reads from Coolify before it writes anything. */
export interface Host {
  /** Where a new application goes. */
  target: {
    project_uuid: string;
    server_uuid: string;
    github_app_uuid: string;
    environment_name: string;
  };
  /**
   * This install's applications: those in the configured environment, built
   * from the install's repository.
   */
  applications: unknown[];
}

/**
 * Refuses, before anything is written, an environment where an application
 * built from another repository has one of the install's `names`, and the
 * install has none by that name. The install would otherwise create a
 * second application with the first one's name and domain. That happens
 * to every app when `repository` changes in coolify.json, since none of
 * the applications is the install's any more.
 */
function requireNamesFree(
  config: CoolifyConfig,
  names: readonly string[],
  ours: readonly unknown[],
  others: readonly unknown[],
): void {
  const held = new Set(ours.map((app) => stringFieldOf(app, "name")));
  const taken = others.filter((app) => {
    const name = stringFieldOf(app, "name");
    return name !== undefined && names.includes(name) && !held.has(name);
  });
  if (taken.length === 0) return;
  throw new CommandProblem(
    [
      `Coolify's ${config.environment} environment has applications with this install's names, built from another repository, so robkit deploy wrote nothing:`,
      ...taken.map(
        (app) =>
          `- ${stringFieldOf(app, "name") ?? "?"}, built from ${stringFieldOf(app, "git_repository") ?? "no repository"}`,
      ),
      `coolify.json names ${config.repository}. If the repository moved, change each application's repository to that in Coolify, then deploy again. If they are another install's, give this install its own project or environment in coolify.json.`,
    ].join("\n"),
  );
}

/**
 * Reads where the install deploys and lists this install's applications.
 * It refuses an environment that lacks a shared variable in `shared`, or
 * where another repository's application has a name in `names`.
 */
export async function readHost(
  api: CoolifyApi,
  config: CoolifyConfig,
  { shared, names }: { shared: readonly string[]; names: readonly string[] },
): Promise<Host> {
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
  await requireSharedVariables(api, target.project_uuid, config, shared);
  // The token lists every application of its team, so keep to this
  // install's environment and repository. Without each one's environment
  // that can't be told, so nothing is written.
  const listed: unknown[] = Array.isArray(applications) ? applications : [];
  if (listed.some((app) => fieldOf(app, "environment_id") == null)) {
    throw new CommandProblem(
      "Coolify listed an application without the environment it belongs to, so robkit deploy can't tell which applications are this install's, and wrote nothing. It needs Coolify 4.3 or later.",
    );
  }
  // Coolify's JSON may give an id as a number or a string.
  const here = listed.filter(
    (app) => String(fieldOf(app, "environment_id")) === String(environment),
  );
  const repository = normalizeRepo(config.repository);
  const isOurs = (app: unknown) =>
    normalizeRepo(stringFieldOf(app, "git_repository") ?? "") === repository;
  const ours = here.filter(isOurs);
  requireNamesFree(
    config,
    names,
    ours,
    here.filter((app) => !isOurs(app)),
  );
  return { target, applications: ours };
}

function normalizeRepo(repository: string): string {
  return repository
    .toLowerCase()
    .replace(/^(https?:\/\/github\.com\/|git@github\.com:)/, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
}

/**
 * The application of the install's named `name`, so one made by hand is
 * adopted rather than duplicated. Every app builds the same Dockerfile, so
 * its name tells them apart.
 */
export function findApp(host: Host, name: string): unknown {
  const matches = host.applications.filter(
    (app) => stringFieldOf(app, "name") === name,
  );
  if (matches.length > 1) {
    throw new CommandProblem(
      `${String(matches.length)} Coolify applications are named ${name}. Delete the extras.`,
    );
  }
  return matches[0];
}
