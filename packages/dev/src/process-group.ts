/** How long an app gets to exit after SIGTERM before it is killed. */
const stopTimeoutMs = 5000;

/** `process.kill`, or a stand-in for it. */
type Kill = (pid: number, signal?: string | number) => true;

/** Whether `error` is the system error with `code`, such as `ESRCH`. */
function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/**
 * Stops an app's whole process group: its package manager, watcher and
 * server. SIGTERM first, then SIGKILL if the group outlives
 * {@link stopTimeoutMs}.
 *
 * @param pid the group leader's pid, undefined for an app that never started
 * @throws if a signal fails for any reason but the group being gone
 */
export async function stopGroup(
  name: string,
  pid: number | undefined,
  kill: Kill = (pid, signal) => process.kill(pid, signal),
): Promise<void> {
  if (pid === undefined) return;
  /** Sends `signal` to the group. False if the group is gone. */
  const signal = (signal: string | number): boolean => {
    try {
      kill(-pid, signal);
      return true;
    } catch (error) {
      // ESRCH is the one answer that means no process is left in the group.
      if (hasCode(error, "ESRCH")) return false;
      throw new Error(
        `Couldn't stop ${name}'s processes (group ${String(pid)}).`,
        {
          cause: error,
        },
      );
    }
  };
  if (!signal("SIGTERM")) return;
  const deadline = Date.now() + stopTimeoutMs;
  while (signal(0)) {
    if (Date.now() >= deadline) {
      signal("SIGKILL");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
