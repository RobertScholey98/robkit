import { execFile } from "node:child_process";
import { realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { readyStacks } from "create-robkit";
import { describe, expect, inject, it } from "vitest";
import { freePortBlock } from "@internal/test-postgres";
import { cleanPath } from "./clean-path.ts";
import { ownCiSteps, runOwnCi } from "./own-ci.ts";

const run = promisify(execFile);

describe("the installs these checks run in", () => {
  it("are none that a journey runs pnpm dev in", () => {
    const journeys = new Set(Object.values(inject("installs")));

    const shared = Object.values(inject("checkInstalls")).filter((dir) =>
      journeys.has(dir),
    );

    expect(shared).toEqual([]);
  });
});

describe("the default install", () => {
  it("is its own git repository, as init with --install leaves it", async () => {
    const dir = inject("checkInstalls").start;

    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
    });

    expect(stdout.trim()).toBe(await realpath(dir));
  });
});

// Every install, so each stack's apps pass lint, robkit check, the format
// check, typecheck, tests and the build, as an example and as an added app.
describe.each(readyStacks)("the %s install", (name) => {
  it("passes its own CI workflow's steps", { timeout: 600_000 }, async () => {
    const dir = inject("checkInstalls")[name];
    const steps = await ownCiSteps(dir);

    const runs = steps.flatMap((step) => step.run ?? []);
    expect(runs).toContainEqual(expect.stringMatching(/^pnpm build$/));
    // A failing step rejects with its output. Its scripts find only the
    // bins the install's own manifests give it, as on the owner's machine.
    // No robkit setting is set, as on CI: each app's tests, which load its
    // Vite config, need none.
    await runOwnCi(dir, steps, {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => !name.startsWith("ROBKIT_"),
        ),
      ),
      PATH: await cleanPath(),
    });
  });
});

// Next loads the guard only on the first request, so withRobkit() checks
// its settings as next dev starts.
describe("the next install's example under next dev", () => {
  it("stops as it starts when ROBKIT_APP is missing, naming it", async () => {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !name.startsWith("ROBKIT_"),
      ),
    );

    const dev = run("pnpm", ["run", "dev"], {
      cwd: join(inject("checkInstalls").next, "apps", "example"),
      env: {
        ...env,
        PORT: String(await freePortBlock(1)),
        ROBKIT_CORE_URL: "http://core.robkit.localhost:3000",
        ROBKIT_DOMAIN: "robkit.localhost",
      },
      // A dev server that started would run until killed.
      timeout: 60_000,
    });

    await expect(dev).rejects.toMatchObject({
      killed: false,
      stderr: expect.stringContaining("ROBKIT_APP is not set.") as string,
    });
  });
});

describe("the start install's lint", () => {
  it.each([
    [
      "an app other than core imports @robkit/core",
      'export * from "@robkit/core";\n',
      "apps/hub/src/reach.ts:1:15  Layer rule: an app or shared package reaches core over HTTP only, never through @robkit/core.",
    ],
    [
      "an app imports another app",
      'export * from "../../example/src/start.ts";\n',
      "apps/hub/src/reach.ts:1:15  Layer rule: an app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.",
    ],
  ])("fails lint when %s", async (_, text, problem) => {
    const dir = inject("checkInstalls").start;
    const file = join(dir, "apps/hub/src/reach.ts");
    await writeFile(file, text);
    try {
      const lint = run("pnpm", ["run", "lint"], {
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

describe("the start install's pre-commit hook", () => {
  const commit = (dir: string, ...args: string[]) =>
    run(
      "git",
      [
        "-c",
        "user.name=robkit",
        "-c",
        "user.email=robkit@example.com",
        ...args,
      ],
      { cwd: dir },
    );

  it("is set up by init's install", async () => {
    const dir = inject("checkInstalls").start;

    const { stdout } = await run("git", ["config", "core.hooksPath"], {
      cwd: dir,
    });

    expect(stdout.trim()).toBe(".husky/_");
  });

  it("refuses a commit that breaks the layer rule", async () => {
    const dir = inject("checkInstalls").start;
    const path = "apps/hub/src/reach.ts";
    await writeFile(join(dir, path), 'export * from "@robkit/core";\n');
    try {
      await commit(dir, "add", path);

      const committing = commit(dir, "commit", "-m", "Reach into core");

      // lint-staged shows the failing task's output on stderr.
      await expect(committing).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "apps/hub/src/reach.ts:1:15  Layer rule: an app or shared package reaches core over HTTP only, never through @robkit/core.",
        ) as string,
      });
    } finally {
      await commit(dir, "rm", "--cached", "--quiet", path);
      await rm(join(dir, path));
    }
  });

  it("takes a commit that keeps it, formatting what it stages", async () => {
    const dir = inject("checkInstalls").start;
    await writeFile(join(dir, "notes.md"), "# Notes\n*   one\n");
    await commit(dir, "add", "notes.md");

    await commit(dir, "commit", "-m", "Add notes");

    const { stdout } = await run("git", ["show", "HEAD:notes.md"], {
      cwd: dir,
    });
    expect(stdout).toBe("# Notes\n\n- one\n");
  });
});
