import { rm } from "node:fs/promises";
import { choicesFromFlags, type Flags } from "create-robkit";
import type { TestProject } from "vitest/node";
import { cleanPath } from "./clean-path.ts";
import { createInstall } from "./install.ts";

declare module "vitest" {
  export interface ProvidedContext {
    /** The one install `pnpm test:combination` makes. */
    combination: {
      /** init's flags that made it, as a command line. */
      name: string;
      /** Its dev tools. */
      tools: string[];
      dir: string;
      /** The clean PATH its scripts run on. */
      path: string;
    };
  }
}

/**
 * Makes the install that E2E_COMBINATION's init flags, as JSON, describe:
 * linked to this checkout, installed, with an app added on its second
 * stack that uses its UI kit. Everything runs on a PATH that can't see
 * robkit's own bins.
 */
export default async function setup(project: TestProject) {
  const given = process.env.E2E_COMBINATION;
  if (!given) {
    throw new Error(
      'Set E2E_COMBINATION to init\'s flags as JSON, such as {"pm":"bun","orm":"kysely"}. `pnpm --filter @internal/matrix plan pull-request` lists the ones CI runs.',
    );
  }
  const flags = JSON.parse(given) as Flags;
  const name = Object.entries(flags)
    .map(([flag, value]) => `--${flag} ${value ?? ""}`)
    .join(" ");
  const choices = choicesFromFlags(flags);
  const path = await cleanPath(choices.packageManager);
  process.env.PATH = path;
  const dir = await createInstall(choices, true);
  project.provide("combination", {
    name,
    tools: choices.tools,
    dir,
    path,
  });
  return async () => {
    await rm(dir, { recursive: true, force: true });
  };
}
