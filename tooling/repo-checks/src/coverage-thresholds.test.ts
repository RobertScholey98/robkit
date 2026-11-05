import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readWorkspaceCoverage, thresholdsIn } from "./coverage-thresholds.ts";

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
