import { spawn } from "node:child_process";
import { CommandProblem } from "@robkit/dev/cli";

/**
 * Runs `command` in `dir`, showing its output.
 *
 * @throws a {@link CommandProblem} naming the command, the folder and its exit
 *   code if it fails, or saying why it couldn't start, with the spawn error
 *   as its cause
 */
function run(command: string, dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // A shell finds pnpm.cmd on Windows. The commands are fixed strings.
    const child = spawn(command, { cwd: dir, shell: true, stdio: "inherit" });
    child.on("error", (error) => {
      const [program] = command.split(" ");
      reject(
        new CommandProblem(
          `${command} couldn't start in ${dir} (${error.message}). Check that ${String(program)} is installed and on your PATH, and that the folder exists.`,
          { cause: error },
        ),
      );
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new CommandProblem(
          `${command} exited with ${String(code ?? signal)} in ${dir}. Its output is above: fix what it says, then try again.`,
        ),
      );
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
