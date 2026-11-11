import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loweredThresholds,
  readCoverage,
  readWorkspaceCoverage,
  thresholdsBelowCoverage,
  thresholdsIn,
} from "./coverage-thresholds.ts";

const config = (
  thresholds: string,
) => `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**"],
      thresholds: ${thresholds},
    },
  },
});
`;

describe("thresholdsIn", () => {
  it("reads a config's thresholds", () => {
    expect(
      thresholdsIn(
        config("{ statements: 95, branches: 90.5, functions: 80, lines: 96 }"),
      ),
    ).toEqual({ statements: 95, branches: 90.5, functions: 80, lines: 96 });
  });

  it("reads thresholds Prettier wrapped onto several lines", () => {
    expect(
      thresholdsIn(config("{\n  statements: 95,\n  lines: 96,\n}")),
    ).toEqual({ statements: 95, lines: 96 });
  });

  it("finds none in a config without them", () => {
    expect(thresholdsIn("export default defineConfig({});")).toBeUndefined();
  });
});

describe("loweredThresholds", () => {
  const path = "packages/guard/vitest.config.ts";

  it("accepts thresholds that stay or go up", () => {
    expect(
      loweredThresholds(
        path,
        { statements: 90, lines: 90 },
        { statements: 90, lines: 95 },
      ),
    ).toEqual([]);
  });

  it("accepts thresholds where there were none", () => {
    expect(loweredThresholds(path, undefined, { lines: 90 })).toEqual([]);
  });

  it("reports a lowered threshold", () => {
    expect(loweredThresholds(path, { lines: 90 }, { lines: 89 })).toEqual([
      `${path} lowers the lines threshold from 90 to 89.`,
    ]);
  });

  it("reports a dropped threshold", () => {
    expect(
      loweredThresholds(path, { lines: 90, branches: 80 }, { lines: 90 }),
    ).toEqual([`${path} drops the branches threshold, which was 80.`]);
  });

  it("reports thresholds that are gone", () => {
    expect(loweredThresholds(path, { lines: 90 }, undefined)).toEqual([
      `${path} no longer sets coverage thresholds.`,
    ]);
  });
});

describe("the robkit workspace", () => {
  it("measures coverage, with thresholds, in every package with tests but e2e", async () => {
    const packages = await readWorkspaceCoverage(
      join(import.meta.dirname, "../../.."),
    );

    expect(packages.map((p) => p.name)).toEqual(
      expect.arrayContaining(["@robkit/guard", "@internal/site"]),
    );
    expect(
      packages
        .filter((p) => p.name !== "@internal/e2e")
        .filter((p) => !p.coverage || p.thresholds === undefined)
        .map((p) => p.name),
    ).toEqual([]);
  });
});

/** One file's Istanbul coverage: statements by the line each starts on. */
const file = (
  statements: [line: number, count: number][],
  functions: number[],
  branches: number[][],
) => ({
  statementMap: Object.fromEntries(
    statements.map(([line], i) => [String(i), { start: { line } }]),
  ),
  s: Object.fromEntries(statements.map(([, count], i) => [String(i), count])),
  f: Object.fromEntries(functions.map((count, i) => [String(i), count])),
  b: Object.fromEntries(branches.map((counts, i) => [String(i), counts])),
});

describe("readCoverage", () => {
  it("totals every file the way Vitest checks thresholds", () => {
    const json = {
      "/a.ts": file(
        [
          [1, 1],
          [2, 0],
          [2, 3],
        ],
        [1, 0],
        [[1, 0, 2]],
      ),
      "/b.ts": file([[1, 0]], [0], [[0, 0]]),
    };
    // 2 of 4 statements, 1 of 3 functions, 2 of 5 branches, and 2 of 3
    // lines: a line counts when any statement on it ran.
    expect(readCoverage(json, "coverage-final.json")).toEqual({
      statements: 50,
      functions: 33.33,
      branches: 40,
      lines: 66.66,
    });
  });

  it("counts a package with nothing to cover as fully covered", () => {
    expect(readCoverage({}, "coverage-final.json")).toEqual({
      statements: 100,
      functions: 100,
      branches: 100,
      lines: 100,
    });
  });

  it.each([
    ["a list", [], "coverage-final.json must be a JSON object."],
    [
      "a file without counts",
      { "/a.ts": { s: {} } },
      "coverage-final.json has no Istanbul coverage for /a.ts.",
    ],
    [
      "a statement without a line",
      { "/a.ts": { ...file([], [], []), statementMap: { 0: {} } } },
      "coverage-final.json has no Istanbul coverage for /a.ts.",
    ],
  ])("refuses %s", (_, json, error) => {
    expect(readCoverage(json, "coverage-final.json")).toEqual({ error });
  });
});

describe("thresholdsBelowCoverage", () => {
  const measured = { statements: 90, branches: 82.5, functions: 80, lines: 92 };

  it("passes thresholds within 2 points of what the tests cover", () => {
    expect(
      thresholdsBelowCoverage(
        "packages/guard/vitest.config.ts",
        { statements: 88, branches: 82, functions: 80, lines: 92 },
        measured,
      ),
    ).toEqual([]);
  });

  it("names each threshold more than 2 points under, and what to raise it to", () => {
    expect(
      thresholdsBelowCoverage(
        "packages/guard/vitest.config.ts",
        { statements: 87, branches: 80 },
        measured,
      ),
    ).toEqual([
      "packages/guard/vitest.config.ts sets the statements threshold to 87, but its tests cover 90%. Raise it to 90.",
      "packages/guard/vitest.config.ts sets the branches threshold to 80, but its tests cover 82.5%. Raise it to 82.",
    ]);
  });
});
