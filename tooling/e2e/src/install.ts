import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { defaultChoices, init, type Choices } from "create-robkit";
import type { TestProject } from "vitest/node";

const run = promisify(execFile);

/** The slug of the app each install adds with robkit add, on its other stack. */
export const addedSlug = "added";

/** The emoji robkit add gives that app. */
export const addedIcon = "🧪";

/**
 * The installs the suites run, by name. Each one's example app is on its
 * first generator, and robkit add gives it an app on its second.
 */
export const installChoices = {
  // The default install.
  start: defaultChoices,
  "react-hono": { ...defaultChoices, generators: ["react-hono", "start"] },
  prisma: { ...defaultChoices, orm: "prisma" },
  kysely: { ...defaultChoices, orm: "kysely" },
} satisfies Record<string, Choices>;

export type InstallName = keyof typeof installChoices;

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
 * its second generator, as the owner would with robkit add's flags.
 */
async function createInstall(choices: Choices): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-install-"));
  await init(choices, dir, { link: true, install: true });
  const [stack, other = stack] = choices.generators;
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
