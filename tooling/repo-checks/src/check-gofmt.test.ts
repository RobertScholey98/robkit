import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "check-gofmt.ts");

let module: string;

async function write(path: string, text: string) {
  await mkdir(join(module, path, ".."), { recursive: true });
  await writeFile(join(module, path), text);
}

function check() {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script], {
    cwd: module,
    encoding: "utf8",
  });
  return { status, output: stdout + stderr };
}

beforeEach(async () => {
  module = await mkdtemp(join(tmpdir(), "gofmt-"));
  await write("go.mod", "module example.com/m\n\ngo 1.26.0\n");
  await write("guard/guard.go", "package guard\n\nfunc Decide() {}\n");
});

afterEach(async () => {
  await rm(module, { recursive: true, force: true });
});

describe("check-gofmt", () => {
  it("passes a module whose Go files are as gofmt writes them", () => {
    expect(check()).toEqual({ status: 0, output: "" });
  });

  it("fails on each file gofmt would change, and says how to fix them", async () => {
    await write("session/session.go", "package session\nfunc  Guarded( ) {}\n");

    expect(check()).toEqual({
      status: 1,
      output: `gofmt would change these files:\n${join("session", "session.go")}\nRun gofmt -w . in ${module} to fix them.\n`,
    });
  });
});
