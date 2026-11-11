// The `lint` script of the Go module in go/ and of the Go template, run in a
// scratch folder through the shell, as pnpm runs it, on a Go file gofmt
// would change. Needs Go.
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJsonFile, readManifest } from "./manifest.ts";

const root = join(import.meta.dirname, "../../..");

const formatted = "package app\n\nfunc Answer() int { return 42 }\n";
const unformatted = "package app\nfunc  Answer( ) int { return 42 }\n";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "go-lint-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Runs `manifest`'s lint script on a folder holding `source`. */
async function lint(manifest: string, source: string) {
  const { scripts } = await readJsonFile(join(root, manifest), readManifest);
  const command = scripts?.lint;
  expect(command).toBeDefined();
  await writeFile(join(dir, "app.go"), source);
  const { status, stdout } = spawnSync(command ?? "", {
    cwd: dir,
    shell: true,
    encoding: "utf8",
  });
  return { status, stdout };
}

describe.each([
  "go/package.json",
  "packages/create-robkit/templates/stacks/go/package.json",
])("the lint script in %s", (manifest) => {
  it("fails on a Go file gofmt would change", async () => {
    const { status, stdout } = await lint(manifest, unformatted);

    expect(status).toBe(1);
    expect(stdout).toContain("+func Answer() int { return 42 }");
  });

  it("passes a formatted one", async () => {
    expect(await lint(manifest, formatted)).toEqual({ status: 0, stdout: "" });
  });
});
