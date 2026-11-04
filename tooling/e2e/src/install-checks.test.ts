import { execFile } from "node:child_process";
import { readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, inject, it } from "vitest";
import { parse } from "yaml";

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

/**
 * The installs whose own CI steps run: the default and one per other ORM.
 * The Kysely install runs bun's workflow.
 */
const ciInstalls = ["start", "prisma", "kysely"] as const;

describe.each(ciInstalls)("the %s install", (name) => {
  it("passes its own CI workflow's steps", { timeout: 600_000 }, async () => {
    const dir = inject("installs")[name];
    const workflow = parse(
      await readFile(join(dir, ".github/workflows/ci.yml"), "utf8"),
    ) as { jobs: Record<string, { steps: { run?: string }[] }> };
    const runs = Object.values(workflow.jobs).flatMap((job) =>
      job.steps.flatMap((step) => step.run ?? []),
    );

    // init already installed the dependencies. Installing again beside the
    // running journeys would touch the files under their core and restart it.
    const steps = runs.filter((step) => !/^\w+ install\b/.test(step));
    expect(steps).toContainEqual(
      expect.stringMatching(/^(pnpm|bun run) build$/),
    );
    for (const step of steps) {
      // A failing step rejects with its output.
      await run("sh", ["-c", step], { cwd: dir });
    }
  });
});

describe("the default install's lint", () => {
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
    const dir = inject("installs").start;
    const file = join(dir, "apps/hub/src/reach.ts");
    await writeFile(file, text);
    try {
      const lint = run("pnpm", ["run", "lint"], { cwd: dir });

      await expect(lint).rejects.toMatchObject({
        stdout: expect.stringContaining(problem) as string,
      });
    } finally {
      await rm(file);
    }
  });
});
