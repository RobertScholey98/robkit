import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  defaultChoices,
  generateInstall,
  writeInstall,
  type Choices,
  type Generator,
} from "create-robkit";
import type { TestProject } from "vitest/node";

const run = promisify(execFile);

declare module "vitest" {
  export interface ProvidedContext {
    /**
     * One install per stack, whose example app is on that stack, by stack.
     * The `start` one is the default install.
     */
    installs: Record<Generator, string>;
  }
}

/**
 * Generates an install whose example app is on `stack` in a temp folder,
 * linked to this checkout's `@robkit/*` packages, and installs its
 * dependencies.
 */
async function createInstall(stack: Generator): Promise<string> {
  const choices: Choices = {
    ...defaultChoices,
    generators: [
      stack,
      ...defaultChoices.generators.filter((other) => other !== stack),
    ],
  };
  const dir = await mkdtemp(join(tmpdir(), "robkit-install-"));
  await writeInstall(dir, await generateInstall(choices, { link: true }));
  // There's no lockfile yet, which pnpm refuses on CI unless told.
  await run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: dir });
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
