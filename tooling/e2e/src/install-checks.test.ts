import { execFile } from "node:child_process";
import { access, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { freePort, freePortBlock } from "@internal/test-postgres";
import { discoverApps } from "@robkit/dev";
import { describe, expect, inject, it } from "vitest";
import { parse } from "yaml";
import { installChoices, type InstallName } from "./install.ts";

const run = promisify(execFile);

describe("the default install", () => {
  it("is its own git repository, as init with --install leaves it", async () => {
    const dir = inject("installs").start;

    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
    });

    expect(stdout.trim()).toBe(await realpath(dir));
  });
});

interface Step {
  if?: string;
  "working-directory"?: string;
  run?: string;
}

/**
 * Whether a step's `if` holds in `dir`. The workflows' only condition is
 * that a file exists, as `hashFiles(<path>) != ''`.
 */
async function holds(condition: string | undefined, dir: string) {
  if (condition === undefined) return true;
  const path = /^hashFiles\('([^']+)'\) != ''$/.exec(condition)?.[1];
  if (path === undefined)
    throw new Error(`can't read the step's if: ${condition}`);
  return access(join(dir, path)).then(
    () => true,
    () => false,
  );
}

/**
 * The installs whose own CI steps run: the default and one per other ORM.
 * The Prisma install runs yarn's workflow with every dev tool, and the
 * Kysely install bun's with none.
 */
const ciInstalls = ["start", "prisma", "kysely"] as const;

describe.each(ciInstalls)("the %s install", (name) => {
  it("passes its own CI workflow's steps", { timeout: 600_000 }, async () => {
    const dir = inject("installs")[name];
    const workflow = parse(
      await readFile(join(dir, ".github/workflows/ci.yml"), "utf8"),
    ) as { jobs: Record<string, { steps: Step[] }> };
    const steps: Step[] = [];
    for (const step of Object.values(workflow.jobs).flatMap(
      (job) => job.steps,
    )) {
      if (step.run !== undefined && (await holds(step.if, dir)))
        steps.push(step);
    }
    // The browser tests run the install's own pnpm dev beside the journeys,
    // so they get free ports.
    const env = {
      ...process.env,
      ROBKIT_E2E_PORT: String(
        await freePortBlock(1 + (await discoverApps(dir)).length),
      ),
      ROBKIT_E2E_POSTGRES_PORT: String(await freePort()),
    };

    const runs = steps.flatMap((step) => step.run ?? []);
    expect(runs).toContainEqual(
      expect.stringMatching(/^(pnpm|(bun|yarn) run) build$/),
    );
    const tools: readonly string[] = installChoices[name].tools;
    expect(runs.some((step) => step.endsWith(" test:e2e"))).toBe(
      tools.includes("playwright"),
    );
    for (const step of steps) {
      // init already installed the dependencies. Installing again beside
      // the running journeys would touch the files under their core and
      // restart it. The browsers are this checkout's own Playwright's, and
      // installing their system packages needs root.
      if (/^\w+ install\b|playwright install\b/.test(step.run ?? "")) continue;
      // A failing step rejects with its output.
      await run("sh", ["-c", step.run ?? ""], {
        cwd: join(dir, step["working-directory"] ?? ""),
        env,
      });
    }
  });
});

/** The installs whose lint must catch a cross-app import: with ESLint, and without. */
const lintInstalls: InstallName[] = ["start", "kysely"];

describe.each(lintInstalls)("the %s install's lint", (name) => {
  it.each([
    [
      "an app other than core imports @robkit/core",
      'export * from "@robkit/core";\n',
      "apps/hub/src/reach.ts:1:15  Layer rule: an app reaches core over HTTP only, never through @robkit/core.",
    ],
    [
      "an app imports another app",
      'export * from "../../example/src/start.ts";\n',
      "apps/hub/src/reach.ts:1:15  Layer rule: an app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.",
    ],
  ])("fails lint when %s", async (_, text, problem) => {
    const dir = inject("installs")[name];
    const file = join(dir, "apps/hub/src/reach.ts");
    await writeFile(file, text);
    try {
      const lint = run(installChoices[name].packageManager, ["run", "lint"], {
        cwd: dir,
      });

      await expect(lint).rejects.toMatchObject({
        stdout: expect.stringContaining(problem) as string,
      });
    } finally {
      await rm(file);
    }
  });
});
