import { exec as execCallback, spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, onTestFinished } from "vitest";
import { defaultChoices, init } from "./index.ts";

// The hub's, admin's and core-client's own unit tests, and the install's
// lint, run in a new install linked to this checkout. They need no Docker,
// so pnpm check runs them; the whole-stack test runs them too, in the
// install's own CI workflow.

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

describe("a new install", () => {
  it("passes its hub's, admin's and core-client's tests, and its lint", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-install-checks-"));
    onTestFinished(() => {
      removeLater(dir);
    });
    await init(defaultChoices, dir, { link: true });
    // pnpm needs no registry for what its store already holds, and the
    // checks need none of the packages' install scripts, such as Husky's.
    await inInstall(
      dir,
      "pnpm install --no-frozen-lockfile --prefer-offline --ignore-scripts",
    );

    await Promise.all([
      inInstall(
        dir,
        "pnpm --filter @internal/hub-app --filter @internal/admin-app --filter @internal/core-client test",
      ),
      inInstall(dir, "pnpm lint"),
    ]);
  }, 240_000);
});
