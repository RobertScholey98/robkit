// What the clean-up watcher does once its owner is gone. Its own module, so
// tests can run it in-process.
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import type { Leftover } from "./clean-up.ts";

/** Whether a process with this pid is running. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function docker(...args: string[]): string[] {
  try {
    return execFileSync("docker", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    // No answer from the command means nothing to clean up.
    return [];
  }
}

function removeDocker(prefix: string): void {
  const mine = (name: string) =>
    name.startsWith(`${prefix}-`) || name.startsWith(`${prefix}_`);
  const containers = docker("ps", "-a", "--format", "{{.Names}}").filter(mine);
  if (containers.length > 0) docker("rm", "-f", "-v", ...containers);
  const networks = docker("network", "ls", "--format", "{{.Name}}").filter(
    mine,
  );
  if (networks.length > 0) docker("network", "rm", ...networks);
  const volumes = docker("volume", "ls", "--format", "{{.Name}}").filter(mine);
  if (volumes.length > 0) docker("volume", "rm", "-f", ...volumes);
  const images = docker(
    "images",
    "--format",
    "{{.Repository}}:{{.Tag}}",
  ).filter((image) => image.startsWith(`${prefix}/`));
  if (images.length > 0) docker("rmi", "-f", ...images);
}

/** The pids of every process whose environment holds `ROBKIT_TEST_TAG=<tag>`. */
function tagged(tag: string): number[] {
  // `e` appends each process's environment to its command, on Linux and macOS.
  const lines = execFileSync("ps", ["axeww", "-o", "pid=,command="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).split("\n");
  const marker = new RegExp(`(^|\\s)ROBKIT_TEST_TAG=${tag}(\\s|$)`);
  return lines
    .filter((line) => marker.test(line))
    .map((line) => Number.parseInt(line, 10))
    .filter((pid) => pid !== process.pid);
}

function signal(pids: number[], name: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, name);
    } catch {
      // Already gone.
    }
  }
}

/**
 * SIGTERM first, so a robkit-dev can stop the apps it started, then SIGKILL
 * whatever is left after 15 seconds.
 */
async function stopTagged(tag: string): Promise<void> {
  signal(tagged(tag), "SIGTERM");
  const deadline = Date.now() + 15_000;
  while (tagged(tag).length > 0 && Date.now() < deadline) await sleep(250);
  signal(tagged(tag), "SIGKILL");
}

/** Removes one leftover. */
export async function removeLeftover(leftover: Leftover): Promise<void> {
  if ("tagged" in leftover) await stopTagged(leftover.tagged);
  else removeDocker(leftover.docker);
}
