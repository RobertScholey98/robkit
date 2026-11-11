import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { CommandProblem } from "@robkit/dev/cli";
import { gitHistory, pushedTo } from "./affected-apps.ts";
import { gitEnv } from "./test/git.ts";

const run = promisify(execFile);

/** A repository with one commit, and the environment to run git in it. */
async function repository(): Promise<{
  dir: string;
  env: NodeJS.ProcessEnv;
  git: (...args: string[]) => Promise<string>;
}> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-history-"));
  const env = await gitEnv(true);
  const git = async (...args: string[]) =>
    (await run("git", args, { cwd: dir, env })).stdout.trim();
  await git("init", "--quiet");
  await git("commit", "--quiet", "--allow-empty", "-m", "first");
  return { dir, env, git };
}

/** Commits nothing, and answers the new commit. */
async function commit(
  git: (...args: string[]) => Promise<string>,
  message: string,
): Promise<string> {
  await git("commit", "--quiet", "--allow-empty", "-m", message);
  return git("rev-parse", "HEAD");
}

/**
 * `env` with a stand-in turbo first on the PATH, which runs `script`.
 */
async function withTurbo(
  env: NodeJS.ProcessEnv,
  script: string,
): Promise<NodeJS.ProcessEnv> {
  const standIn = await mkdtemp(join(tmpdir(), "turbo-stand-in-"));
  await writeFile(join(standIn, "turbo"), `#!/bin/sh\n${script}\n`, {
    mode: 0o755,
  });
  return { ...env, PATH: `${standIn}:${String(env.PATH)}` };
}

describe("gitHistory", () => {
  it("names the commit the checkout is on", async () => {
    const { dir, env, git } = await repository();

    const history = await gitHistory(dir, env);

    expect(history.head).toBe(await git("rev-parse", "HEAD"));
  });

  it("says robkit deploy runs from a git checkout outside one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-not-git-"));
    const env = {
      ...(await gitEnv(true)),
      GIT_CEILING_DIRECTORIES: tmpdir(),
    };

    const found = gitHistory(dir, env);

    await expect(found).rejects.toBeInstanceOf(CommandProblem);
    await expect(found).rejects.toThrow(
      /^robkit deploy runs from the install's git checkout, and git couldn't name its commit: .+\. Run it in the install's repository\.$/,
    );
  });

  it("finds a commit a force push took out of the branch gone from history", async () => {
    const { dir, env, git } = await repository();
    const first = await git("rev-parse", "HEAD");
    const pushed = await commit(git, "pushed, then pushed over");
    await git("reset", "--quiet", "--hard", first);
    await commit(git, "pushed with --force");

    const history = await gitHistory(dir, env);

    expect(await history.changedSince(pushed)).toEqual({
      outcome: "not-in-history",
    });
  });

  it("finds a commit the checkout doesn't have gone from history", async () => {
    const { dir, env } = await repository();

    const history = await gitHistory(dir, env);

    expect(await history.changedSince("b".repeat(40))).toEqual({
      outcome: "not-in-history",
    });
  });
});

// The stand-in turbo is a shell script, which Windows can't run.
describe.skipIf(process.platform === "win32")("gitHistory's changes", () => {
  it("asks turbo what changed since the commit asked about, whatever TURBO_SCM_BASE says", async () => {
    const { dir, env, git } = await repository();
    const recorded = await git("rev-parse", "HEAD");
    const failedRun = await commit(git, "a push whose run failed");
    await commit(git, "the next push");
    const turbo = await withTurbo(
      { ...env, TURBO_SCM_BASE: failedRun },
      [
        `if [ "$TURBO_SCM_BASE" = "${recorded}" ]; then`,
        `  echo '{"packages":{"items":[{"path":"apps/notes"},{"path":"apps/hub"},{"path":"packages/ui"}]}}'`,
        "else",
        `  echo '{"packages":{"items":[{"path":"apps/hub"}]}}'`,
        "fi",
      ].join("\n"),
    );

    const history = await gitHistory(dir, turbo);

    expect(await history.changedSince(recorded)).toEqual({
      outcome: "changed",
      apps: ["notes", "hub"],
    });
  });

  it("throws turbo's own message as a problem when turbo ls fails", async () => {
    const { dir, env, git } = await repository();
    const recorded = await git("rev-parse", "HEAD");
    await commit(git, "next");
    const turbo = await withTurbo(
      env,
      "echo '  x No package manager found.' >&2\nexit 1",
    );

    const found = (await gitHistory(dir, turbo)).changedSince(recorded);

    await expect(found).rejects.toBeInstanceOf(CommandProblem);
    await expect(found).rejects.toThrow(
      "turbo ls --affected couldn't find the apps that changed: x No package manager found. Name the apps to deploy with --apps, or deploy them all with --all.",
    );
  });

  it("says when turbo prints JSON robkit can't read", async () => {
    const { dir, env, git } = await repository();
    const recorded = await git("rev-parse", "HEAD");
    await commit(git, "next");
    const turbo = await withTurbo(env, `echo '{"packages":{}}'`);

    await expect(
      (await gitHistory(dir, turbo)).changedSince(recorded),
    ).rejects.toThrow(
      "turbo ls --affected printed JSON robkit can't read. Name the apps to deploy with --apps, or deploy them all with --all.",
    );
  });
});

describe("pushedTo", () => {
  /** A repository with a bare one as its `origin`. */
  async function withRemote(): Promise<Awaited<ReturnType<typeof repository>>> {
    const checkout = await repository();
    const remote = await mkdtemp(join(tmpdir(), "robkit-remote-"));
    await run("git", ["init", "--quiet", "--bare"], {
      cwd: remote,
      env: checkout.env,
    });
    await checkout.git("remote", "add", "origin", remote);
    return checkout;
  }

  it("finds the checkout's commit on the branch at a remote", async () => {
    const { dir, env, git } = await withRemote();
    await git("push", "--quiet", "origin", "HEAD:refs/heads/main");

    expect(await pushedTo(dir, "main", env)).toBe(true);
  });

  it("finds a commit not pushed yet missing", async () => {
    const { dir, env, git } = await withRemote();
    await git("push", "--quiet", "origin", "HEAD:refs/heads/main");
    await commit(git, "not pushed");

    expect(await pushedTo(dir, "main", env)).toBe(false);
  });

  it("finds a commit pushed only to another branch missing", async () => {
    const { dir, env, git } = await withRemote();
    await git("push", "--quiet", "origin", "HEAD:refs/heads/feature");

    expect(await pushedTo(dir, "main", env)).toBe(false);
  });

  it("finds a commit in a checkout with no remote missing", async () => {
    const { dir, env } = await repository();

    expect(await pushedTo(dir, "main", env)).toBe(false);
  });

  it("finds the checkout's commit when the remote's branch is ahead of it", async () => {
    const { dir, env, git } = await withRemote();
    await commit(git, "pushed after the checkout's commit");
    await git("push", "--quiet", "origin", "HEAD:refs/heads/main");
    await git("reset", "--quiet", "--hard", "HEAD~1");

    expect(await pushedTo(dir, "main", env)).toBe(true);
  });
});
