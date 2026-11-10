// pnpm release:version, run in a throwaway clone that pushes to a stand-in
// remote, with a stand-in gh. Nothing reaches GitHub.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { subjectProblems } from "./commit-subject.ts";
import { ticketProblems } from "./pr-ticket.ts";
import { openVersionPullRequest } from "./version-pull-request.ts";

const root = join(import.meta.dirname, "../../..");

let dir: string;
let remote: string;
let clone: string;
/** Each call the stand-in gh received. */
let ghCalls: string[][];

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Clones the stand-in remote, as someone git lets commit. CI's runner has no identity of its own. */
function cloneRemote(to: string) {
  git(dir, "clone", "-q", remote, to);
  git(to, "config", "user.name", "Test");
  git(to, "config", "user.email", "test@example.com");
}

async function write(path: string, text: string) {
  await mkdir(join(clone, path, ".."), { recursive: true });
  await writeFile(join(clone, path), text);
}

const manifest = (name: string) =>
  `${JSON.stringify({ name, version: "0.0.0" })}\n`;

/** Runs pnpm release:version in the clone, with gh standing in. */
function open() {
  return openVersionPullRequest(clone, (args) => {
    ghCalls.push(args);
    return Promise.resolve(
      "https://github.com/RobertScholey98/robkit/pull/999\n",
    );
  });
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "robkit-release-version-"));
  remote = join(dir, "remote.git");
  clone = join(dir, "clone");
  ghCalls = [];
  git(dir, "init", "-q", "--bare", "-b", "main", remote);
  cloneRemote(clone);
  await write("package.json", '{ "name": "robkit", "private": true }\n');
  await write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
  await write("packages/create-robkit/package.json", manifest("create-robkit"));
  await write("packages/input/package.json", manifest("@robkit/input"));
  await mkdir(join(clone, ".changeset"));
  await copyFile(
    join(root, ".changeset/config.json"),
    join(clone, ".changeset/config.json"),
  );
  await write(
    ".changeset/input-reads-more.md",
    '---\n"@robkit/input": minor\n---\n\nReads more.\n',
  );
  git(clone, "add", "-A");
  git(clone, "commit", "-q", "--no-verify", "-m", "Start");
  git(clone, "push", "-q", "-u", "origin", "main");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("openVersionPullRequest", { timeout: 120_000 }, () => {
  it("commits the new versions on a new branch and pushes it", async () => {
    const opened = await open();

    expect(opened).toEqual({
      branch: "release-v0.1.0",
      version: "0.1.0",
      url: "https://github.com/RobertScholey98/robkit/pull/999",
    });
    const pushed = "origin/release-v0.1.0";
    const subject = git(clone, "log", "-1", "--format=%s", pushed);
    expect(subject).toBe("Version packages as 0.1.0");
    expect(subjectProblems(subject)).toEqual([]);
    for (const folder of ["create-robkit", "input"]) {
      const json = git(
        clone,
        "show",
        `${pushed}:packages/${folder}/package.json`,
      );
      expect(JSON.parse(json)).toMatchObject({ version: "0.1.0" });
    }
    expect(
      git(clone, "show", `${pushed}:packages/input/CHANGELOG.md`),
    ).toContain("## 0.1.0\n\n### Minor Changes");
    // The changeset is used up, and main itself is as it was.
    expect(
      git(clone, "ls-tree", "--name-only", pushed, ".changeset/"),
    ).not.toContain("input-reads-more.md");
    expect(git(remote, "log", "-1", "--format=%s", "main")).toBe("Start");
  });

  it("opens the pull request against main, with a body the ticket check passes", async () => {
    await open();

    expect(ghCalls).toHaveLength(2);
    const [auth, args = []] = ghCalls;
    expect(auth).toEqual(["auth", "status"]);
    expect(args.slice(0, 8)).toEqual([
      "pr",
      "create",
      "--base",
      "main",
      "--head",
      "release-v0.1.0",
      "--title",
      "Version packages as 0.1.0",
    ]);
    expect(args[8]).toBe("--body");
    const body = args[9] ?? "";
    expect(body).toContain(
      ".scratch/just-use-it/issues/14-release-workflow.md",
    );
    expect(
      ticketProblems(body, (path) => existsSync(join(root, path))),
    ).toEqual([]);
  });

  it("refuses to run off main, and changes nothing", async () => {
    git(clone, "switch", "-q", "-c", "elsewhere");

    await expect(open()).rejects.toThrow(
      "Run pnpm release:version on main. This clone is on elsewhere: git switch main, then git pull.",
    );
    expect(ghCalls).toEqual([]);
    expect(git(clone, "status", "--porcelain")).toBe("");
  });

  it("refuses a clone with uncommitted changes", async () => {
    await write("notes.txt", "draft\n");

    await expect(open()).rejects.toThrow(
      "This clone has changes that aren't committed, and the version commit would take them. Commit or remove them, then run pnpm release:version again.",
    );
    expect(ghCalls).toEqual([]);
  });

  it("refuses a main behind origin's", async () => {
    const other = join(dir, "other");
    cloneRemote(other);
    git(other, "commit", "-q", "--no-verify", "--allow-empty", "-m", "Later");
    git(other, "push", "-q");

    await expect(open()).rejects.toThrow(
      "This clone's main isn't origin's main. Run git pull, then pnpm release:version again.",
    );
    expect(ghCalls).toEqual([]);
  });

  it("refuses when no changeset waits", async () => {
    git(clone, "rm", "-q", ".changeset/input-reads-more.md");
    git(clone, "commit", "-q", "--no-verify", "-m", "Drop the changeset");
    git(clone, "push", "-q");

    await expect(open()).rejects.toThrow(
      "No changeset waits in .changeset/, so there is nothing to release.",
    );
    expect(ghCalls).toEqual([]);
  });

  it("refuses when the version's branch already exists, and changes nothing", async () => {
    git(clone, "push", "-q", "origin", "main:release-v0.1.0");

    await expect(open()).rejects.toThrow(
      "origin already has a branch release-v0.1.0. Merge or close its pull request and delete the branch, then run pnpm release:version again.",
    );
    expect(git(clone, "rev-parse", "--abbrev-ref", "HEAD")).toBe("main");
    expect(git(clone, "status", "--porcelain")).toBe("");
    expect(ghCalls).toEqual([]);
  });
});
