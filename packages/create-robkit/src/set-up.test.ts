import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CommandProblem } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { firstCommit, installDependencies, startGit } from "./set-up.ts";
import { gitEnv } from "./test/git.ts";
import { pathWith } from "./test/path.ts";

const run = promisify(execFile);

// A real pnpm install takes about 5s on a cold CI runner.
describe("installDependencies", () => {
  it("installs with pnpm, writing its lockfile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));
    await writeFile(join(dir, "package.json"), `{ "private": true }\n`);

    await installDependencies(dir);

    expect(await readFile(join(dir, "pnpm-lock.yaml"), "utf8")).toContain(
      "lockfileVersion:",
    );
  });
});

describe("installDependencies", { timeout: 30_000 }, () => {
  it("names the command, its folder and its exit code when the install fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));
    await writeFile(join(dir, "package.json"), "{ nope");

    const installing = installDependencies(dir);

    await expect(installing).rejects.toThrow(CommandProblem);
    await expect(installing).rejects.toThrow(
      `pnpm install --no-frozen-lockfile exited with 1 in ${dir}. Its output is above: fix what it says, then try again.`,
    );
  });
});

/** A new folder holding one file. */
async function folderWithAFile(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-"));
  await writeFile(join(dir, "README.md"), "# An install\n");
  return dir;
}

async function subjects(dir: string): Promise<string[]> {
  const { stdout } = await run("git", ["log", "--format=%s"], { cwd: dir });
  return stdout.trim().split("\n");
}

describe("startGit", () => {
  it("makes the folder a git repository of its own", async () => {
    const dir = await folderWithAFile();

    expect(await startGit(dir, await gitEnv(true))).toBeUndefined();

    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
    });
    expect(stdout.trim()).toBe((await realpath(dir)).replaceAll("\\", "/"));
  });

  it("says in one line that there's no first commit when git isn't installed", async () => {
    const dir = await folderWithAFile();

    expect(await startGit(dir, await pathWith({}))).toBe(
      "git isn't installed, so init made no first commit.",
    );
  });
});

describe("firstCommit", () => {
  it("commits every file, skipping the install's own pre-commit hook", async () => {
    const dir = await folderWithAFile();
    const env = await gitEnv(true);
    await startGit(dir, env);
    await mkdir(join(dir, ".husky"));
    await writeFile(join(dir, ".husky/pre-commit"), "exit 1\n", {
      mode: 0o755,
    });
    await run("git", ["config", "core.hooksPath", ".husky"], { cwd: dir });

    expect(await firstCommit(dir, env)).toBeUndefined();

    expect(await subjects(dir)).toEqual(["Make a robkit install"]);
    const { stdout } = await run("git", ["status", "--porcelain"], {
      cwd: dir,
    });
    expect(stdout).toBe("");
  });

  it("says in one line that there's no first commit when git has no name or email", async () => {
    const dir = await folderWithAFile();
    const env = await gitEnv(false);
    await startGit(dir, env);

    expect(await firstCommit(dir, env)).toBe(
      "git has no name or email set, so init made no first commit. Set them with git config --global user.name and git config --global user.email.",
    );
    await expect(
      run("git", ["rev-parse", "HEAD"], { cwd: dir }),
    ).rejects.toThrow();
  });

  it("says in one line what failed when the commit fails for any other reason", async () => {
    const dir = await folderWithAFile();

    expect(await firstCommit(dir, await gitEnv(true))).toMatch(
      /^init made no first commit: git add --all exited with 128\. fatal: not a git repository[^\n]*$/,
    );
  });
});
