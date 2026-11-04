import { describe, expect, it } from "vitest";
import { pairwise, uncoveredPairs } from "./pairwise.ts";

const dimensions = [
  { name: "pm", values: ["pnpm", "bun", "yarn"] },
  { name: "orm", values: ["drizzle", "prisma"] },
  { name: "kit", values: ["none", "chakra"] },
];

describe("pairwise", () => {
  it("holds every pair of values from two different dimensions", () => {
    const rows = pairwise(dimensions);

    expect(uncoveredPairs(dimensions, rows)).toEqual([]);
  });

  it("needs fewer rows than every combination", () => {
    // 3 × 2 × 2 = 12 combinations. The largest pair of dimensions, 3 × 2,
    // needs 6 rows at least.
    expect(pairwise(dimensions)).toHaveLength(6);
  });

  it("starts from its seeds, filling in what they leave out", () => {
    const rows = pairwise(dimensions, [{ kit: "chakra" }, { pm: "yarn" }]);

    expect(rows[0]?.kit).toBe("chakra");
    expect(rows[1]?.pm).toBe("yarn");
    expect(Object.keys(rows[0] ?? {})).toEqual(["pm", "orm", "kit"]);
    expect(uncoveredPairs(dimensions, rows)).toEqual([]);
  });

  it("gives the same rows every time", () => {
    expect(pairwise(dimensions)).toEqual(pairwise(dimensions));
  });
});

describe("uncoveredPairs", () => {
  it("names each pair no row holds", () => {
    const rows = [
      { pm: "pnpm", orm: "drizzle", kit: "none" },
      { pm: "bun", orm: "prisma", kit: "chakra" },
    ];

    expect(uncoveredPairs(dimensions.slice(0, 2), rows)).toEqual([
      "pm=pnpm and orm=prisma",
      "pm=bun and orm=drizzle",
      "pm=yarn and orm=drizzle",
      "pm=yarn and orm=prisma",
    ]);
  });
});
