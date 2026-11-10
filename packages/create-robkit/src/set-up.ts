import { CommandProblem, exec } from "@robkit/dev/cli";
import { onPath, run, type Ran } from "./toolchain.ts";

/** Installs a new install's dependencies, which have no lockfile yet. */
export function installDependencies(
  dir: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // pnpm on CI refuses an install with no lockfile unless told.
  return exec("pnpm", ["install", "--no-frozen-lockfile"], {
    cwd: dir,
    env,
  });
}

/**
 * Installs the dependencies of the install at `dir`, whose files are
 * already written. "Try again" would hit the folder that's now in use, so
 * a failure says how to finish instead: `written` says what has its files.
 *
 * @throws a {@link CommandProblem} naming the folder and the command that
 *   finishes the job, when pnpm install fails
 */
export async function finishInstall(
  dir: string,
  written: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  try {
    await installDependencies(dir, env);
  } catch (error) {
    if (!(error instanceof CommandProblem)) throw error;
    throw new CommandProblem(
      `pnpm install failed in ${dir}, so ${written}. Its output is above. Fix what it says, then run pnpm install in ${dir} to finish.`,
      { cause: error },
    );
  }
}

/** One line saying which git command failed, and git's first line on why. */
function failed(args: string[], { code, stdout, stderr }: Ran): string {
  const why = (stderr || stdout).trim().split("\n")[0] ?? "";
  return `init made no first commit: git ${args.join(" ")} exited with ${String(code)}. ${why}`.trim();
}

/**
 * Makes `dir` a git repository. A new install starts git before it
 * installs, so Husky's install script finds the repository and sets its
 * hook up.
 *
 * @returns why the install will have no first commit, in one line, or
 *   `undefined`
 */
export async function startGit(
  dir: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (!onPath("git", env)) {
    return "git isn't installed, so init made no first commit.";
  }
  const args = ["init", "--quiet"];
  const ran = await run("git", args, { cwd: dir, env });
  return ran.code === 0 ? undefined : failed(args, ran);
}

/**
 * Commits everything in `dir`, a new install that {@link startGit} made a
 * repository. It skips the install's own pre-commit hook: the commit is
 * init's, of files robkit wrote. A failure can't spoil the install, so it
 * comes back as a line to print rather than a throw.
 *
 * @returns why it made no commit, in one line, or `undefined`
 */
export async function firstCommit(
  dir: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const options = { cwd: dir, env };
  // git var answers as a commit would: it fails where git has no name or
  // email and won't make one up.
  for (const who of ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"]) {
    if ((await run("git", ["var", who], options)).code !== 0) {
      return "git has no name or email set, so init made no first commit. Set them with git config --global user.name and git config --global user.email.";
    }
  }
  for (const args of [
    ["add", "--all"],
    ["commit", "--quiet", "--no-verify", "-m", "Make a robkit install"],
  ]) {
    const ran = await run("git", args, options);
    if (ran.code !== 0) return failed(args, ran);
  }
  return undefined;
}
