import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loweredThresholds,
  readWorkspaceCoverage,
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

    expect(packages.map((p) => p.name)).toContain("@robkit/guard");
    expect(
      packages
        .filter((p) => p.name !== "@internal/e2e")
        .filter((p) => !p.coverage || p.thresholds === undefined)
        .map((p) => p.name),
    ).toEqual([]);
  });
});
