// The command itself. version-pull-request.test.ts covers what it does in a
// clone, with a stand-in remote and gh.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "release-version.ts");

let repo: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "robkit-release-version-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git("init", "-q", "-b", "elsewhere");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "-q",
    "--no-verify",
    "--allow-empty",
    "-m",
    "Start",
  );
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("release-version.ts", () => {
  it("prints what to do, without a stack, when it refuses", () => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [script], {
      cwd: repo,
      encoding: "utf8",
    });

    expect(status).toBe(1);
    expect(stdout).toBe("");
    expect(stderr.trim()).toBe(
      "Run pnpm release:version on main. This clone is on elsewhere: git switch main, then git pull.",
    );
  });
});
