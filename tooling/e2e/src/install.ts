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
 * first generator, and robkit add gives it an app on its second. In the
 * installs with a UI kit, the example app uses it.
 */
export const installChoices = {
  // The default install.
  start: defaultChoices,
  "react-hono": {
    ...defaultChoices,
    generators: ["react-hono", "start"],
    uiKit: "chakra",
  },
  // On yarn, which runs its scripts and installs its dependencies. It has
  // every dev tool, and the Kysely install none, so each tool's CI steps
  // run with the tool on and off.
  prisma: {
    ...defaultChoices,
    packageManager: "yarn",
    orm: "prisma",
    uiKit: "shadcn-radix",
    tools: ["eslint-prettier", "vitest", "playwright", "husky"],
  },
  // On bun, which runs its scripts and installs its dependencies.
  kysely: {
    ...defaultChoices,
    packageManager: "bun",
    orm: "kysely",
    uiKit: "shadcn-base-ui",
    tools: [],
  },
} satisfies Record<string, Choices>;

export type InstallName = keyof typeof installChoices;

/**
 * The installs whose added app opts in to their UI kit. In the other
 * installs with a kit, it opts out with --no-ui-kit.
 */
const addedUsesKit: ReadonlySet<string> = new Set(["react-hono"]);

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
 * its second generator, as the owner would with robkit add's flags, using
 * the install's UI kit if `kit` is set.
 */
export async function createInstall(
  choices: Choices,
  kit: boolean,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-install-"));
  await init(choices, dir, { link: true, install: true });
  const [stack, other = stack] = choices.generators;
  await run(
    choices.packageManager,
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
      ...(choices.uiKit ? [kit ? "--ui-kit" : "--no-ui-kit"] : []),
    ],
    { cwd: dir },
  );
  return dir;
}

/**
 * Makes every install before any suite starts. pnpm and bun hard-link
 * packages from one shared store, so an install beside a running dev stack
 * touches the files under its core, and `node --watch` restarts core
 * mid-journey.
 */
export default async function setup(project: TestProject) {
  const installs = Object.fromEntries(
    await Promise.all(
      Object.entries(installChoices).map(
        async ([name, choices]) =>
          [name, await createInstall(choices, addedUsesKit.has(name))] as const,
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
