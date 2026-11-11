import { exec as execCallback, execFile, spawn } from "node:child_process";
import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultChoices, init } from "./index.ts";

// The hub's, admin's and core-client's own unit tests, and the install's
// lint and typecheck, run in a new install linked to this checkout. They need no Docker,
// so pnpm check runs them; the whole-stack test runs them too, in the
// install's own CI workflow.
//
// pnpm hard-links the install's packages from its store, which restarts
// any running dev stack's core, so turbo runs the whole-stack test only
// after this one.

const run = promisify(execCallback);
const runFile = promisify(execFile);

/** Runs `command` in the install, failing with its output if it fails. */
async function inInstall(dir: string, command: string): Promise<void> {
  try {
    await run(command, { cwd: dir, maxBuffer: 16 * 1024 * 1024 });
  } catch (error) {
    throw new Error(`\`${command}\` failed in the new install.`, {
      cause: error,
    });
  }
}

/**
 * Removes `dir` in a process of its own. Deleting an install's
 * node_modules takes several seconds on Windows, which pnpm check would
 * otherwise wait for.
 */
function removeLater(dir: string): void {
  spawn(
    process.execPath,
    [
      "-e",
      "require('node:fs').rmSync(process.argv[1], { recursive: true, force: true, maxRetries: 5 })",
      dir,
    ],
    { detached: true, stdio: "ignore" },
  ).unref();
}

/**
 * The hash turbo gives each build and test task in the install, by task:
 * the key it would answer from cache with.
 */
async function taskHashes(dir: string): Promise<Record<string, string>> {
  const { stdout } = await runFile(
    "pnpm",
    ["exec", "turbo", "run", "build", "test", "--dry=json"],
    {
      cwd: dir,
      maxBuffer: 16 * 1024 * 1024,
      shell: process.platform === "win32",
    },
  );
  const dry = JSON.parse(stdout.slice(stdout.indexOf("{"))) as {
    tasks: { taskId: string; hash: string }[];
  };
  return Object.fromEntries(dry.tasks.map((task) => [task.taskId, task.hash]));
}

/** The tasks whose hash differs between `before` and `after`. */
function changed(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  return Object.keys(after)
    .filter((task) => before[task] !== after[task])
    .sort();
}

/**
 * What pnpm check runs in a new install: the hub's, admin's and
 * core-client's tests, the install's lint, and the install's typecheck.
 * Rejects naming the first that fails.
 */
async function checkInstall(dir: string): Promise<void> {
  await Promise.all([
    inInstall(
      dir,
      "pnpm --filter @internal/hub-app --filter @internal/admin-app --filter @internal/core-client test",
    ),
    inInstall(dir, "pnpm lint"),
    inInstall(dir, "pnpm typecheck"),
  ]);
}

// One install for both tests, in order: the second breaks it.
describe("a new install", { concurrent: false }, () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "robkit-install-checks-"));
    await init(defaultChoices, dir, { link: true, install: false });
    // pnpm needs no registry for what its store already holds, and the
    // checks need none of the packages' install scripts, such as Husky's.
    await inInstall(
      dir,
      "pnpm install --no-frozen-lockfile --prefer-offline --ignore-scripts",
    );
  }, 240_000);

  afterAll(() => {
    removeLater(dir);
  });

  it("passes its hub's, admin's and core-client's tests, its lint and its typecheck", async () => {
    await checkInstall(dir);
  }, 240_000);

  it("builds and tests again each app that uses a shared package that changed", async () => {
    const start = await taskHashes(dir);
    await appendFile(join(dir, "packages/theme/theme.css"), "/* edited */\n");
    const themed = await taskHashes(dir);
    await appendFile(
      join(dir, "packages/core-client/src/call-core.ts"),
      "// edited\n",
    );
    const called = await taskHashes(dir);

    expect(changed(start, themed)).toEqual(
      expect.arrayContaining([
        "@internal/admin-app#build",
        "@internal/example-app#build",
        "@internal/hub-app#build",
        "@internal/hub-app#test",
      ]),
    );
    expect(changed(themed, called)).toEqual(
      expect.arrayContaining([
        "@internal/admin-app#build",
        "@internal/admin-app#test",
        "@internal/hub-app#build",
        "@internal/hub-app#test",
      ]),
    );
    expect(changed(themed, called)).not.toContain(
      "@internal/example-app#build",
    );
  }, 240_000);

  it("fails on a type error in a template's file", async () => {
    const file = join(dir, "apps/hub/src/core-api.ts");
    await appendFile(file, 'export const port: number = "3000";\n');

    await expect(checkInstall(dir)).rejects.toThrow(
      "`pnpm typecheck` failed in the new install.",
    );
  }, 240_000);
});
