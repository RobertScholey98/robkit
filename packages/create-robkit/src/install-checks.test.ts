import { exec as execCallback, spawn } from "node:child_process";
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

  it("fails on a type error in a template's file", async () => {
    const file = join(dir, "apps/hub/src/core-api.ts");
    await appendFile(file, 'export const port: number = "3000";\n');

    await expect(checkInstall(dir)).rejects.toThrow(
      "`pnpm typecheck` failed in the new install.",
    );
  }, 240_000);
});
