import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "check-branch-rules.ts");

/** GitHub's answer for main's rules on 2026-11-06; see branch-rules.test.ts. */
const recorded = await readFile(
  join(import.meta.dirname, "branch-rules.recorded.json"),
  "utf8",
);

const check = (answer: string) => {
  const { status, stdout, stderr } = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    input: answer,
  });
  return { status, output: stdout + stderr };
};

describe("check-branch-rules.ts", () => {
  it("passes main's recorded rules", () => {
    expect(check(recorded)).toEqual({
      status: 0,
      output:
        "main requires a pull request and the gate check, and blocks force pushes and deletion.\n",
    });
  });

  it("fails loosened rules, naming each gap", () => {
    // GitHub's answer for a branch no ruleset covers.
    const { status, output } = check("[]");

    expect(status).toBe(1);
    expect(output.split("\n").filter(Boolean)).toHaveLength(4);
    expect(output).toContain("main doesn't require the gate status check");
  });

  it("fails an answer that isn't JSON", () => {
    const { status, output } = check("gh: Not Found (HTTP 404)");

    expect(status).toBe(1);
    expect(output).toMatch(
      /^GitHub's answer for main's rules isn't JSON \(.+\)\. It began: gh: Not Found \(HTTP 404\)\n$/,
    );
  });
});
