import { afterEach, describe, expect, it, vi } from "vitest";
import { productionRun, stubRun, testRuns } from "./index.ts";

describe("stubRun", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets NODE_ENV, and sets or removes VITEST", () => {
    const seen = [productionRun, ...testRuns.map((run) => run.settings)].map(
      (settings) => {
        stubRun(settings);
        return [process.env.NODE_ENV, "VITEST" in process.env];
      },
    );

    expect(seen).toEqual([
      ["production", false],
      ["test", false],
      ["production", true],
      ["development", false],
      ["test", true],
    ]);
  });
});
