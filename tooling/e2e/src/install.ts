import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { init, readyStacks, type Choices, type Stack } from "create-robkit";
import type { TestProject } from "vitest/node";
import { removeWhenGone } from "@internal/test-postgres";
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
    /**
     * A second install for each, for install-checks.test.ts, whose builds
     * and edits would otherwise land under a running `pnpm dev`.
     */
    checkInstalls: Record<InstallName, string>;
  }
}

/**
 * Adds an app on the stack after `exampleStack` to the install in `dir`,
 * as the owner would with robkit add's flags. With `pnpm dev` running
 * there, robkit add has it start the app.
 *
 * @returns what robkit add printed
 */
export async function addTheApp(
  dir: string,
  exampleStack: Stack,
): Promise<string> {
  const other = addedStackFor(exampleStack);
  const { stdout } = await run(
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
  return stdout;
}

/**
 * Makes an install for `choices` in a temp folder, as init with
 * `--link` does: linked to this checkout's `@robkit/*` packages,
 * with its dependencies installed and git initialised. With `add`, it then
 * adds an app on the next stack.
 */
export async function createInstall(
  choices: Choices,
  { add = true }: { add?: boolean } = {},
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-install-"));
  // Its teardown removes it too, but not when the run is killed.
  removeWhenGone({ path: dir });
  await init(choices, dir, { link: true });
  if (add) await addTheApp(dir, choices.exampleStack);
  return dir;
}

/** One install for each of `installChoices`, by name. */
async function createInstalls(
  add: boolean,
): Promise<Record<InstallName, string>> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(installChoices).map(
        async ([name, choices]) =>
          [name, await createInstall(choices, { add })] as const,
      ),
    ),
  ) as Record<InstallName, string>;
}

/**
 * Makes every install before any suite starts. A suite's install has no
 * added app yet: the suite adds it while `pnpm dev` runs, as an owner
 * would. The installs install-checks.test.ts builds have theirs already.
 */
export default async function setup(project: TestProject) {
  const [installs, checkInstalls] = await Promise.all([
    createInstalls(false),
    createInstalls(true),
  ]);
  project.provide("installs", installs);
  project.provide("checkInstalls", checkInstalls);
  return async () => {
    await Promise.all(
      [...Object.values(installs), ...Object.values(checkInstalls)].map((dir) =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
  };
}
