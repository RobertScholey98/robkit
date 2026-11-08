import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { init, readyStacks, type Choices, type Stack } from "create-robkit";
import type { TestProject } from "vitest/node";
import { slug } from "@internal/test-session";

const run = promisify(execFile);

/** The example app every install starts with. */
export const exampleSlug = slug("example");

/** The slug of the app each install adds with robkit add, on the next stack. */
export const addedSlug = slug("added");

/** The emoji robkit add gives that app. */
export const addedIcon = "🧪";

/**
 * The installs the suites run, by name: one for each stack robkit can make,
 * with its example app on that stack. `start` is the default install.
 */
export const installChoices = Object.fromEntries(
  readyStacks.map((stack) => [stack, { exampleStack: stack }]),
) as Record<Stack, Choices>;

/** An install is named after its example's stack. */
export type InstallName = Stack;

/**
 * The stack robkit add gives the install whose example is on `stack`: the
 * next one in robkit's list, wrapping round. So each stack is an example
 * once and an added app once.
 */
export function addedStackFor(stack: Stack): Stack {
  const next =
    readyStacks[(readyStacks.indexOf(stack) + 1) % readyStacks.length];
  return next ?? stack;
}

declare module "vitest" {
  export interface ProvidedContext {
    /** Each install in `installChoices`, made in a temp folder, by name. */
    installs: Record<InstallName, string>;
  }
}

/**
 * Makes an install for `choices` in a temp folder, as init with
 * `--install --link` does: linked to this checkout's `@robkit/*` packages,
 * with its dependencies installed and git initialised. Then adds an app on
 * the next stack, as the owner would with robkit add's flags.
 */
export async function createInstall(choices: Choices): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-install-"));
  await init(choices, dir, { link: true, install: true });
  const other = addedStackFor(choices.exampleStack);
  await run(
    "pnpm",
    [
      "run",
      "robkit",
      "add",
      addedSlug,
      "--stack",
      other,
      "--access",
      "open",
      "--icon",
      addedIcon,
    ],
    { cwd: dir },
  );
  return dir;
}

/**
 * Makes every install before any suite starts. pnpm hard-links
 * packages from one shared store, so an install beside a running dev stack
 * touches the files under its core, and `node --watch` restarts core
 * mid-journey.
 */
export default async function setup(project: TestProject) {
  const installs = Object.fromEntries(
    await Promise.all(
      Object.entries(installChoices).map(
        async ([name, choices]) =>
          [name, await createInstall(choices)] as const,
      ),
    ),
  ) as Record<InstallName, string>;
  project.provide("installs", installs);
  return async () => {
    await Promise.all(
      Object.values(installs).map((dir) =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
  };
}
