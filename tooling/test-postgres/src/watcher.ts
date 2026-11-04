// Run by removeWhenGone: waits for the owner process to exit, then removes
// what it left. Arguments: the owner's pid and the leftovers as JSON.
import { execFileSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import type { Leftover } from "./clean-up.ts";

const [ownerArg = "", leftoversArg = "[]"] = process.argv.slice(2);
const owner = Number(ownerArg);
const leftovers = JSON.parse(leftoversArg) as Leftover[];

function alive(pid: number): boolean {
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
}

function signalGroup(group: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-group, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * SIGTERM first, so a `robkit-dev` in the group stops the apps it started in
 * groups of their own, then SIGKILL whatever is left.
 */
async function stopGroup(group: number): Promise<void> {
  // -0 would be the watcher's own group.
  if (!(group > 0) || !signalGroup(group, "SIGTERM")) return;
  const deadline = Date.now() + 15_000;
  while (signalGroup(group, 0) && Date.now() < deadline) await sleep(250);
  signalGroup(group, "SIGKILL");
}

while (alive(owner)) await sleep(1000);

for (const leftover of leftovers) {
  if ("group" in leftover) await stopGroup(leftover.group);
  else removeDocker(leftover.docker);
}
