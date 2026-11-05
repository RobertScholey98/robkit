import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Who robkit's own commits are by when git doesn't know the person, as on
 * CI. Otherwise git's own settings name them.
 */
const fallbackIdentity = {
  GIT_AUTHOR_NAME: "robkit",
  GIT_AUTHOR_EMAIL: "robkit@localhost",
  GIT_COMMITTER_NAME: "robkit",
  GIT_COMMITTER_EMAIL: "robkit@localhost",
};

let identity: Promise<NodeJS.ProcessEnv> | undefined;

/** The variables that name a commit's author, if git can't. */
function identityEnv(dir: string): Promise<NodeJS.ProcessEnv> {
  identity ??= run("git", ["config", "user.email"], { cwd: dir }).then(
    () => ({}),
    () => fallbackIdentity,
  );
  return identity;
}

/** A failed git command, with what git said. */
export class GitError extends Error {
  readonly output: string;

  constructor(args: readonly string[], output: string) {
    super(`git ${args.join(" ")} failed:\n${output.trim()}`);
    this.output = output;
  }
}

/**
 * Runs git in `dir` and returns what it printed, trimmed. It never waits
 * for a password: a remote that needs one must have a credential helper or
 * an SSH key. Rejects with a `GitError` if git fails.
 */
export async function git(
  dir: string,
  args: readonly string[],
): Promise<string> {
  try {
    const { stdout } = await run("git", args, {
      cwd: dir,
      env: {
        ...(await identityEnv(dir)),
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout.trim();
  } catch (error) {
    const { stdout = "", stderr = "" } = error as {
      stdout?: string;
      stderr?: string;
    };
    throw new GitError(args, `${stdout}\n${stderr}`);
  }
}

/** Whether `dir` is a git repository of its own. */
export function isRepo(dir: string): boolean {
  return existsSync(join(dir, ".git"));
}
