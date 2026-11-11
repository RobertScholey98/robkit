import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommandProblem } from "@robkit/dev/cli";
import {
  type InputProblem,
  isProblem,
  parseJson,
  type Slug,
} from "@robkit/input";
import { readAffectedApps } from "./env.ts";

/** What a failed child process said, without its trailing full stop. */
function saidBy(error: unknown): string {
  const said =
    error instanceof Error && "stderr" in error
      ? String(error.stderr).trim()
      : String(error);
  return said.replace(/\.$/, "");
}

/**
 * The commit the checkout at `root` is on, which robkit deploy compares
 * each application's record with.
 *
 * @throws a {@link CommandProblem} outside a git checkout
 */
async function headCommit(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  try {
    const { stdout } = await promisify(execFile)("git", ["rev-parse", "HEAD"], {
      cwd: root,
      env,
    });
    return stdout.trim();
  } catch (error) {
    throw new CommandProblem(
      `robkit deploy runs from the install's git checkout, and git couldn't name its commit: ${saidBy(error)}. Run it in the install's repository.`,
      { cause: error },
    );
  }
}

/** What changed in the checkout since a commit. */
export type Changes =
  | { outcome: "changed"; apps: readonly Slug[] }
  /** The commit isn't in the history of the commit robkit runs from. */
  | { outcome: "not-in-history" };

/** The checkout robkit deploy runs from, as the deploy asks about it. */
export interface History {
  /** The commit it runs from. */
  head: string;
  changedSince(commit: string): Promise<Changes>;
}

/**
 * The checkout at `root`. turbo finds what changed since each commit asked
 * about, whatever TURBO_SCM_BASE in `env` says.
 *
 * @throws a {@link CommandProblem} outside a git checkout
 */
export async function gitHistory(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<History> {
  return {
    head: await headCommit(root, env),
    changedSince: (commit) => changedSince(root, commit, env),
  };
}

/**
 * A repository's `owner/name` in lower case, from its short name or from a
 * URL in any form git takes: https, `git@host:owner/name.git` or ssh.
 */
function repositoryName(repository: string): string {
  return repository
    .trim()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "")
    .split(/[/:]/)
    .slice(-2)
    .join("/")
    .toLowerCase();
}

/**
 * Whether the checkout's commit is on `branch` of `repository` as a remote
 * of the checkout holds it, which is what Coolify builds. The branch may be
 * ahead of the commit. A remote counts only when its URL names
 * `repository`: a push to a fork or a backup isn't one Coolify sees.
 */
export async function pushedTo(
  root: string,
  { repository, branch }: { repository: string; branch: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const git = async (...args: string[]) =>
    (await promisify(execFile)("git", args, { cwd: root, env })).stdout.trim();
  const wanted = repositoryName(repository);
  for (const remote of (await git("remote")).split("\n").filter(Boolean)) {
    try {
      if (repositoryName(await git("remote", "get-url", remote)) !== wanted) {
        continue;
      }
      await git(
        "merge-base",
        "--is-ancestor",
        "HEAD",
        `refs/remotes/${remote}/${branch}`,
      );
      return true;
    } catch {
      // Not on this remote's branch, or the remote hasn't one: try the next.
    }
  }
  return false;
}

async function changedSince(
  root: string,
  commit: string,
  env: NodeJS.ProcessEnv,
): Promise<Changes> {
  try {
    await promisify(execFile)(
      "git",
      ["merge-base", "--is-ancestor", commit, "HEAD"],
      { cwd: root, env },
    );
  } catch {
    // git says no, or doesn't have the commit, as after a force push or in
    // a shallow clone: either way the app deploys.
    return { outcome: "not-in-history" };
  }
  const apps = await appsTurboFinds(root, { ...env, TURBO_SCM_BASE: commit });
  if (isProblem(apps)) throw new CommandProblem(apps.error);
  return { outcome: "changed", apps };
}

/**
 * The apps turbo finds changed since TURBO_SCM_BASE in `env`, by slug.
 *
 * @throws a {@link CommandProblem} with turbo's own message when
 *   `turbo ls` fails
 */
async function appsTurboFinds(
  root: string,
  env: NodeJS.ProcessEnv,
): Promise<Slug[] | InputProblem> {
  let stdout: string;
  try {
    ({ stdout } = await promisify(exec)("turbo ls --affected --output json", {
      cwd: root,
      env,
    }));
  } catch (error) {
    throw new CommandProblem(
      `turbo ls --affected couldn't find the apps that changed: ${saidBy(error)}. Name the apps to deploy with --apps, or deploy them all with --all.`,
      { cause: error },
    );
  }
  const parsed = parseJson(stdout, "turbo ls --affected's output");
  return isProblem(parsed) ? parsed : readAffectedApps(parsed.json);
}
