import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "check-coverage-ratchet.ts");
const guard = "packages/guard/vitest.config.ts";
const report = "packages/guard/coverage/coverage-final.json";

let repo: string;

async function write(path: string, text: string) {
  await mkdir(join(repo, path, ".."), { recursive: true });
  await writeFile(join(repo, path), text);
}

const config = (lines: number) =>
  `export default { test: { coverage: { thresholds: { lines: ${String(lines)} } } } };\n`;

/** A report in which `covered` of 10 one-statement lines ran. */
const coverage = (covered: number) =>
  JSON.stringify({
    "/src/guard.ts": {
      statementMap: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [i, { start: { line: i + 1 } }]),
      ),
      s: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [i, i < covered ? 1 : 0]),
      ),
      f: {},
      b: {},
    },
  });

function check() {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script], {
    cwd: repo,
    encoding: "utf8",
  });
  return { status, output: stdout + stderr };
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "coverage-ratchet-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  await write(guard, config(90));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("check-coverage-ratchet", () => {
  it("passes a threshold within 2 points of what the tests cover", async () => {
    await write(report, coverage(9));

    expect(check()).toEqual({ status: 0, output: "" });
  });

  it("fails a threshold more than 2 points under, naming the number to raise it to", async () => {
    await write(report, coverage(10));

    expect(check()).toEqual({
      status: 1,
      output: `${guard} sets the lines threshold to 90, but its tests cover 100%. Raise it to 100.\n`,
    });
  });

  it("fails when a package with thresholds has no coverage report", () => {
    expect(check()).toEqual({
      status: 1,
      output: `${report} is missing. Run the package's tests first.\n`,
    });
  });

  it("skips a package without thresholds", async () => {
    await write(guard, "export default {};\n");

    expect(check()).toEqual({ status: 0, output: "" });
  });
});
