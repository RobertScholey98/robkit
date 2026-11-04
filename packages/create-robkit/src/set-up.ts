import { spawn } from "node:child_process";
import type { PackageManager } from "./choices.ts";
import { packageManagers } from "./package-managers.ts";

/** Runs `command` in `dir`, showing its output, and fails if it does. */
function run(command: string, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // A shell finds pnpm.cmd on Windows. The commands are fixed strings.
    const child = spawn(command, { cwd: dir, shell: true, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed in ${dir}`));
    });
  });
}

export function installDependencies(
  dir: string,
  packageManager: PackageManager,
): Promise<void> {
  return run(packageManagers[packageManager].install, dir);
}

export function initGit(dir: string): Promise<void> {
  return run("git init --quiet", dir);
}
