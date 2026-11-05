import type { ChildProcess } from "node:child_process";

/** How long an app gets to exit after SIGTERM before it is killed. */
const stopTimeoutMs = 5000;

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    // Signal 0 throws only when the group is gone.
    return false;
  }
}

/** Stops an app's whole process group: its package manager, watcher and server. */
export async function stopGroup(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // The group has already exited.
    return;
  }
  const deadline = Date.now() + stopTimeoutMs;
  while (groupAlive(pid) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (groupAlive(pid)) process.kill(-pid, "SIGKILL");
}
