import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

/** Something a test leaves running that outlives it unless removed. */
export type Leftover =
  /**
   * Every process whose environment holds `ROBKIT_TEST_TAG=<tagged>`. A
   * process inherits the tag from whoever started it, so this reaches
   * everything a `pnpm dev` started, even apps in sessions of their own whose
   * parent has died. They get SIGTERM, so robkit-dev can stop its apps, then
   * SIGKILL after 15 seconds.
   */
  | { tagged: string }
  /**
   * Docker containers, networks and volumes named `<prefix>-…` or
   * `<prefix>_…`, as a Compose project names everything it makes.
   */
  | { docker: string };

/** A new value for `ROBKIT_TEST_TAG`, to give a process a test starts. */
export function testTag(): string {
  return `${String(process.pid)}-${randomBytes(4).toString("hex")}`;
}

const watcher = fileURLToPath(new URL("./watcher.ts", import.meta.url));

/**
 * Removes `leftovers` once this process is gone, however it ends. A test's
 * own teardown doesn't run when turbo stops a failed run or a test worker is
 * killed, and every Postgres left behind slows Docker for the runs after it.
 * A detached watcher, outside this process's group, waits for it to exit.
 */
export function removeWhenGone(...leftovers: Leftover[]): void {
  spawn(
    process.execPath,
    [watcher, String(process.pid), JSON.stringify(leftovers)],
    { detached: true, stdio: "ignore" },
  ).unref();
}
