import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readyStacks } from "create-robkit";
import { describe, expect, it } from "vitest";
import { readStackJourneys, stackJourneyProblems } from "./stack-journeys.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("stackJourneyProblems", () => {
  it("accepts a stack whose file runs its journeys", () => {
    expect(
      stackJourneyProblems(
        new Map([["express", 'describeJourneys("express");\n']]),
      ),
    ).toEqual([]);
  });

  it("names a ready stack with no file", () => {
    expect(stackJourneyProblems(new Map([["next", undefined]]))).toEqual([
      'next is a ready stack with no tooling/e2e/src/next.test.ts, so CI runs no journeys on it. Add the file, calling describeJourneys("next").',
    ]);
  });

  it("names a file that runs another stack's journeys", () => {
    expect(
      stackJourneyProblems(new Map([["go", 'describeJourneys("start");\n']])),
    ).toEqual([
      'tooling/e2e/src/go.test.ts doesn\'t call describeJourneys("go"), so CI runs no journeys on go.',
    ]);
  });
});

describe("readStackJourneys", () => {
  it("reads each stack's file, and no file as undefined", async () => {
    const files = await readStackJourneys(root, ["start", "cobol"]);

    expect(files.get("start")).toContain('describeJourneys("start"');
    expect(files.has("cobol")).toBe(true);
    expect(files.get("cobol")).toBeUndefined();
  });

  it("fails on a file it can't read, rather than calling it missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "robkit-stack-journeys-"));
    await mkdir(join(dir, "tooling/e2e/src/odd.test.ts"), { recursive: true });

    await expect(readStackJourneys(dir, ["odd"])).rejects.toMatchObject({
      code: "EISDIR",
    });
  });
});

describe("the robkit repo", () => {
  it("runs the whole-stack journeys on every ready stack", async () => {
    expect(
      stackJourneyProblems(await readStackJourneys(root, readyStacks)),
    ).toEqual([]);
  });
});
