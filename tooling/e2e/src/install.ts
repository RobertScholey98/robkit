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
} from "create-robkit";
import type { TestProject } from "vitest/node";

const run = promisify(execFile);

/** The installs the suites run against, by name. */
export const installs = {
  /** The default install, whose example app is on TanStack Start. */
  start: defaultChoices,
  reactHono: { ...defaultChoices, generators: ["react-hono", "start"] },
  /** Another default install, for the suites that don't run `pnpm dev`. */
  checks: defaultChoices,
} satisfies Record<string, Choices>;

export type InstallName = keyof typeof installs;

declare module "vitest" {
  export interface ProvidedContext {
    /** Each install's folder, by name. */
    installs: Record<InstallName, string>;
  }
}

/**
 * Generates an install for `choices` in a temp folder, linked to this
 * checkout's `@robkit/*` packages, and installs its dependencies.
 */
async function createInstall(choices: Choices): Promise<string> {
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
  const names = Object.keys(installs) as InstallName[];
  const dirs = await Promise.all(
    names.map((name) => createInstall(installs[name])),
  );
  project.provide(
    "installs",
    Object.fromEntries(names.map((name, i) => [name, dirs[i]])) as Record<
      InstallName,
      string
    >,
  );
  return async () => {
    await Promise.all(
      dirs.map((dir) => rm(dir, { recursive: true, force: true })),
    );
  };
}
