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

export function pick(list: unknown, name: string, kind: string): string {
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
export async function environmentId(
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
export async function requireSharedVariables(
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
