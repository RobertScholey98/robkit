import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Something a test leaves running that outlives it unless removed. */
export type Leftover =
  /**
   * A process group, such as a detached `pnpm dev`. It gets SIGTERM, so
   * robkit-dev can stop its apps, then SIGKILL after 15 seconds.
   */
  | { group: number }
  /**
   * Docker containers, networks and volumes named `<prefix>-…` or
   * `<prefix>_…`, as a Compose project names everything it makes.
   */
  | { docker: string };

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
