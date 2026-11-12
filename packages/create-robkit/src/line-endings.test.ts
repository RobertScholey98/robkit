import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { defaultChoices } from "./choices.ts";
import { init } from "./init.ts";
import { gitEnv } from "./test/git.ts";

const run = promisify(execFile);

describe("a new install's line endings", () => {
  // Git for Windows checks text out with CRLF unless told otherwise, and
  // sh won't run a hook with CRLF endings.
  it("stay LF in a clone made with core.autocrlf=true", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "robkit-")), "install");
    await init(defaultChoices, dir, { install: false });
    const env = await gitEnv(true);
    const git = (cwd: string, ...args: string[]) =>
      run("git", args, { cwd, env });
    await git(dir, "init", "--quiet");
    await git(dir, "add", "--all");
    await git(dir, "commit", "--quiet", "--no-verify", "-m", "An install");
    const clone = join(await mkdtemp(join(tmpdir(), "robkit-")), "clone");

    await git(dir, "-c", "core.autocrlf=true", "clone", "--quiet", dir, clone);

    const withCr = [];
    for (const path of [".husky/pre-commit", "compose.yaml"]) {
      if ((await readFile(join(clone, path))).includes("\r")) withCr.push(path);
    }
    expect(withCr).toEqual([]);
  });
});
