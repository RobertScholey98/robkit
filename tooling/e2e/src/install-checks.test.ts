import { execFile } from "node:child_process";
import { realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, inject, it } from "vitest";
import { cleanPath } from "./clean-path.ts";
import type { InstallName } from "./install.ts";
import { ownCiSteps, runOwnCi } from "./own-ci.ts";

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

/** The installs whose own CI steps run. */
const ciInstalls = ["start"] as const;

describe.each(ciInstalls)("the %s install", (name) => {
  it("passes its own CI workflow's steps", { timeout: 600_000 }, async () => {
    const dir = inject("installs")[name];
    const steps = await ownCiSteps(dir);

    const runs = steps.flatMap((step) => step.run ?? []);
    expect(runs).toContainEqual(expect.stringMatching(/^pnpm build$/));
    // A failing step rejects with its output. Its scripts find only the
    // bins the install's own manifests give it, as on the owner's machine.
    await runOwnCi(dir, steps, {
      ...process.env,
      PATH: await cleanPath("pnpm"),
    });
  });
});

/** The installs whose lint must catch a cross-app import. */
const lintInstalls: InstallName[] = ["start"];

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
    const dir = inject("installs").start;

    const { stdout } = await run("git", ["config", "core.hooksPath"], {
      cwd: dir,
    });

    expect(stdout.trim()).toBe(".husky/_");
  });

  it("refuses a commit that breaks the layer rule", async () => {
    const dir = inject("installs").start;
    const path = "apps/hub/src/reach.ts";
    await writeFile(join(dir, path), 'export * from "@robkit/core";\n');
    try {
      await commit(dir, "add", path);

      const committing = commit(dir, "commit", "-m", "Reach into core");

      // lint-staged shows the failing task's output on stderr.
      await expect(committing).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "apps/hub/src/reach.ts:1:15  Layer rule: an app reaches core over HTTP only, never through @robkit/core.",
        ) as string,
      });
    } finally {
      await commit(dir, "rm", "--cached", "--quiet", path);
      await rm(join(dir, path));
    }
  });

  it("takes a commit that keeps it, formatting what it stages", async () => {
    const dir = inject("installs").start;
    await writeFile(join(dir, "notes.md"), "# Notes\n*   one\n");
    await commit(dir, "add", "notes.md");

    await commit(dir, "commit", "-m", "Add notes");

    const { stdout } = await run("git", ["show", "HEAD:notes.md"], {
      cwd: dir,
    });
    expect(stdout).toBe("# Notes\n\n- one\n");
  });
});
