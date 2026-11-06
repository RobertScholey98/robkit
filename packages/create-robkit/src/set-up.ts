import { exec } from "@robkit/dev/cli";

/** Installs a new install's dependencies, which have no lockfile yet. */
export function installDependencies(dir: string): Promise<void> {
  // pnpm on CI refuses an install with no lockfile unless told.
  return exec("pnpm", ["install", "--no-frozen-lockfile"], {
    cwd: dir,
    env: process.env,
  });
}

export function initGit(dir: string): Promise<void> {
  return exec("git", ["init", "--quiet"], { cwd: dir, env: process.env });
}
