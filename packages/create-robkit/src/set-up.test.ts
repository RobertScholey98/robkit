import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Problem } from "@robkit/dev/cli";
import { describe, expect, it } from "vitest";
import { initGit, installDependencies } from "./set-up.ts";

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

    await expect(installing).rejects.toThrow(Problem);
    await expect(installing).rejects.toThrow(
      `pnpm install --no-frozen-lockfile exited with 1 in ${dir}. Its output is above: fix what it says, then try again.`,
    );
  });
});

describe("initGit", () => {
  it("makes the folder a git repository of its own", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));

    await initGit(dir);

    const { stdout } = await run("git", ["rev-parse", "--show-toplevel"], {
      cwd: dir,
    });
    expect(stdout.trim()).toBe((await realpath(dir)).replaceAll("\\", "/"));
  });

  it("says what to check when git can't start in the folder, keeping why", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "gone");

    const initialising = initGit(dir);

    await expect(initialising).rejects.toThrow(Problem);
    await expect(initialising).rejects.toThrow(
      /^git init --quiet couldn't start in .+gone \(spawn .+ ENOENT\)\. Check that git is installed and on your PATH, and that the folder exists\.$/,
    );
    await expect(initialising).rejects.toHaveProperty("cause.code", "ENOENT");
  });
});
