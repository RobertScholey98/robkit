// What `pnpm release:version` does: the version pull request, opened from
// a clone of main. No workflow opens it, since GitHub starts no checks on a
// pull request a workflow's own token opened, and main needs the gate.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { isProblem, isRecord, parseJson } from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";

const run = promisify(execFile);

/** changesets' command line, from this checkout's own install. */
const changeset = fileURLToPath(
  new URL("../../../node_modules/@changesets/cli/bin.js", import.meta.url),
);

/** The ticket that made the release path, which the pull request names. */
const ticket = ".scratch/just-use-it/issues/14-release-workflow.md";

/** Runs gh with `args` and gives what it printed. */
export type Gh = (args: string[]) => Promise<string>;

/** The version pull request that {@link openVersionPullRequest} opened. */
export interface VersionPullRequest {
  branch: string;
  version: string;
  /** The pull request's address, as gh printed it. */
  url: string;
}

/**
 * The version the waiting changesets release, as `changeset status` plans
 * it. Every package is in one fixed group, so they share it.
 */
async function nextVersion(cwd: string): Promise<string | undefined> {
  const out = await mkdtemp(join(tmpdir(), "robkit-release-status-"));
  try {
    const file = join(out, "status.json");
    await run(process.execPath, [changeset, "status", `--output=${file}`], {
      cwd,
    });
    const parsed = parseJson(await readFile(file, "utf8"), file);
    if (isProblem(parsed) || !isRecord(parsed.json)) return undefined;
    const { releases } = parsed.json;
    const first: unknown = Array.isArray(releases) ? releases[0] : undefined;
    return isRecord(first) && typeof first.newVersion === "string"
      ? first.newVersion
      : undefined;
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

/** The version pull request's body, filled in as the template asks. */
function body(version: string): string {
  return [
    "## Ticket",
    "",
    ticket,
    "",
    "## What changed",
    "",
    `\`pnpm release:version\` ran \`changeset version\`. Every package goes to ${version}, each package's \`CHANGELOG.md\` gains the changesets that name it, and those changesets are gone.`,
    "",
    "## Proof",
    "",
    "CI's `gate` job checks it. Once it merges, publish from main with the release workflow, as CONTRIBUTING.md's \"Releasing\" says.",
    "",
  ].join("\n");
}

/**
 * Opens the version pull request from the clone at `cwd`, which must be on
 * main, up to date with origin's and with nothing uncommitted. It cuts a
 * branch, runs `changeset version`, commits, pushes and opens the pull
 * request with `gh`. Anything it refuses, it refuses before changing a file.
 */
export async function openVersionPullRequest(
  cwd: string,
  gh: Gh,
): Promise<VersionPullRequest> {
  const git = async (...args: string[]) =>
    (await run("git", args, { cwd })).stdout.trim();

  const branchNow = await git("rev-parse", "--abbrev-ref", "HEAD");
  if (branchNow !== "main") {
    throw new CommandProblem(
      `Run pnpm release:version on main. This clone is on ${branchNow}: git switch main, then git pull.`,
    );
  }
  if ((await git("status", "--porcelain")) !== "") {
    throw new CommandProblem(
      "This clone has changes that aren't committed, and the version commit would take them. Commit or remove them, then run pnpm release:version again.",
    );
  }
  await git("fetch", "-q", "origin", "main");
  if (
    (await git("rev-parse", "HEAD")) !== (await git("rev-parse", "origin/main"))
  ) {
    throw new CommandProblem(
      "This clone's main isn't origin's main. Run git pull, then pnpm release:version again.",
    );
  }
  const version = await nextVersion(cwd);
  if (version === undefined) {
    throw new CommandProblem(
      "No changeset waits in .changeset/, so there is nothing to release.",
    );
  }
  const branch = `release-v${version}`;
  const taken =
    (await git("ls-remote", "--heads", "origin", branch)) !== "" ||
    (await git("branch", "--list", branch)) !== "";
  if (taken) {
    throw new CommandProblem(
      `origin already has a branch ${branch}. Merge or close its pull request and delete the branch, then run pnpm release:version again.`,
    );
  }

  // gh fails here, before a file changes, if it can't open the pull request.
  await gh(["auth", "status"]);

  const title = `Version packages as ${version}`;
  await git("switch", "-q", "-c", branch);
  await run(process.execPath, [changeset, "version"], { cwd });
  await git("add", "-A");
  await git("commit", "-q", "-m", title);
  await git("push", "-q", "-u", "origin", branch);
  const url = await gh([
    "pr",
    "create",
    "--base",
    "main",
    "--head",
    branch,
    "--title",
    title,
    "--body",
    body(version),
  ]);
  return { branch, version, url: url.trim() };
}
