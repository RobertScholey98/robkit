import { spawn } from "node:child_process";

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

/** Installs a new install's dependencies, which have no lockfile yet. */
export function installDependencies(dir: string): Promise<void> {
  // pnpm on CI refuses an install with no lockfile unless told.
  return run("pnpm install --no-frozen-lockfile", dir);
}

export function initGit(dir: string): Promise<void> {
  return run("git init --quiet", dir);
}
