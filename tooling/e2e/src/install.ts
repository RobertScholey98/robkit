import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  defaultChoices,
  init,
  type Choices,
  type Generator,
} from "create-robkit";
import type { TestProject } from "vitest/node";

const run = promisify(execFile);

/** The slug of the app each install adds with robkit add, on its other stack. */
export const addedSlug = "added";

/** The emoji robkit add gives that app. */
export const addedIcon = "🧪";

declare module "vitest" {
  export interface ProvidedContext {
    /**
     * One install per stack, whose example app is on that stack, by stack.
     * The `start` one is the default install. Each also has an app on the
     * other stack, added with robkit add and open to anyone.
     */
    installs: Record<Generator, string>;
  }
}

/**
 * Makes an install whose example app is on `stack` in a temp folder, as
 * init with `--install --link` does: linked to this checkout's `@robkit/*`
 * packages, with its dependencies installed and git initialised. Then adds
 * an app on the other stack, as the owner would with robkit add's flags.
 */
async function createInstall(stack: Generator): Promise<string> {
  const others = defaultChoices.generators.filter((other) => other !== stack);
  const choices: Choices = {
    ...defaultChoices,
    generators: [stack, ...others],
  };
  const dir = await mkdtemp(join(tmpdir(), "robkit-install-"));
  await init(choices, dir, { link: true, install: true });
  const [other = stack] = others;
  await run(
    "pnpm",
    [
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
 * Makes every install before any suite starts. pnpm hard-links packages
 * from one shared store, so an install beside a running `pnpm dev` touches
 * the files under its core, and `node --watch` restarts core mid-journey.
 */
export default async function setup(project: TestProject) {
  const installs = Object.fromEntries(
    await Promise.all(
      defaultChoices.generators.map(
        async (stack) => [stack, await createInstall(stack)] as const,
      ),
    ),
  ) as Record<Generator, string>;
  project.provide("installs", installs);
  return async () => {
    await Promise.all(
      Object.values(installs).map((dir) =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
  };
}
