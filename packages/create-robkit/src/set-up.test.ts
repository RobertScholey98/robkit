import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { initGit, installDependencies } from "./set-up.ts";

const run = promisify(execFile);

// A real pnpm install takes about 5s on a cold CI runner.
describe("installDependencies", { timeout: 30_000 }, () => {
  it("installs with pnpm, writing its lockfile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-"));
    await writeFile(join(dir, "package.json"), `{ "private": true }\n`);

    await installDependencies(dir);

    expect(await readFile(join(dir, "pnpm-lock.yaml"), "utf8")).toContain(
      "lockfileVersion:",
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
});
