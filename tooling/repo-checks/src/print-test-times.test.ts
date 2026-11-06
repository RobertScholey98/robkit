import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "print-test-times.ts");

let repo: string;

/** A run summary holding one test task that took `ms`. */
const summary = (ms: number) =>
  JSON.stringify({
    tasks: [
      {
        taskId: "@internal/e2e#test",
        execution: { startTime: 0, endTime: ms },
        cache: { status: "MISS" },
      },
    ],
  });

function print() {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script], {
    cwd: repo,
    encoding: "utf8",
  });
  return { status, output: stdout + stderr };
}

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), "test-times-"));
});

afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

describe("print-test-times", () => {
  it("prints the newest run's test times", async () => {
    const runs = join(repo, ".turbo/runs");
    await mkdir(runs, { recursive: true });
    await writeFile(join(runs, "old.json"), summary(1_000));
    await utimes(join(runs, "old.json"), 0, 0);
    await writeFile(join(runs, "new.json"), summary(185_000));

    expect(print()).toEqual({
      status: 0,
      output: [
        "### Test times",
        "",
        "| Task | Time |",
        "| --- | --- |",
        "| @internal/e2e#test | 3m 05s |",
        "",
        "",
      ].join("\n"),
    });
  });

  it("fails without a run summary, saying how to get one", () => {
    expect(print()).toEqual({
      status: 1,
      output:
        ".turbo/runs has no run summary. Run turbo with TURBO_RUN_SUMMARY=true.\n",
    });
  });
});
