import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CommandProblem } from "@robkit/dev/cli";
import { affectedApps, headCommit } from "./affected-apps.ts";
import { gitEnv } from "./test/git.ts";

const git = promisify(execFile);

/** A repository with one commit, and the environment to run git in it. */
async function repository(): Promise<{ dir: string; env: NodeJS.ProcessEnv }> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-history-"));
  const env = await gitEnv(true);
  await git("git", ["init", "--quiet"], { cwd: dir, env });
  await git("git", ["commit", "--quiet", "--allow-empty", "-m", "first"], {
    cwd: dir,
    env,
  });
  return { dir, env };
}

describe("headCommit", () => {
  it("reads the commit the checkout is on", async () => {
    const { dir, env } = await repository();
    const { stdout } = await git("git", ["rev-parse", "HEAD"], {
      cwd: dir,
      env,
    });

    expect(await headCommit(dir, env)).toBe(stdout.trim());
  });

  it("says robkit deploy runs from a git checkout outside one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-not-git-"));
    const env = { ...(await gitEnv(true)), GIT_CEILING_DIRECTORIES: tmpdir() };

    const found = headCommit(dir, env);

    await expect(found).rejects.toBeInstanceOf(CommandProblem);
    await expect(found).rejects.toThrow(
      /^robkit deploy runs from the install's git checkout, and git couldn't name its commit: .+\. Run it in the install's repository\.$/,
    );
  });
});

/**
 * The environment with a stand-in turbo first on the PATH, which runs
 * `script`.
 */
async function withTurbo(script: string): Promise<NodeJS.ProcessEnv> {
  const standIn = await mkdtemp(join(tmpdir(), "turbo-stand-in-"));
  await writeFile(join(standIn, "turbo"), `#!/bin/sh\n${script}\n`, {
    mode: 0o755,
  });
  return { ...process.env, PATH: `${standIn}:${String(process.env.PATH)}` };
}

// The stand-in turbo is a shell script, which Windows can't run.
describe.skipIf(process.platform === "win32")("affectedApps", () => {
  it("reads the apps turbo ls found changed", async () => {
    const env = await withTurbo(
      `echo '{"packages":{"items":[{"path":"apps/notes"},{"path":"packages/ui"}]}}'`,
    );

    expect(await affectedApps(tmpdir(), env)).toEqual(["notes"]);
  });

  it("throws turbo's own message as a problem when turbo ls fails", async () => {
    const env = await withTurbo(
      "echo '  x No git repository found.' >&2\nexit 1",
    );

    const found = affectedApps(tmpdir(), env);

    await expect(found).rejects.toBeInstanceOf(CommandProblem);
    await expect(found).rejects.toThrow(
      "turbo ls --affected couldn't find the apps that changed: x No git repository found. Name the apps to deploy with --apps, or deploy them all with --all.",
    );
  });
});
