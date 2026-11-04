import { choicesFromFlags, choiceTable, type Flags } from "create-robkit";
import { describe, expect, it } from "vitest";
import {
  dimensionsOfTable,
  nightlySet,
  pullRequestSet,
  rowOf,
  type Combination,
  type Table,
} from "./combinations.ts";
import { uncoveredPairs } from "./pairwise.ts";

const allTools = "eslint-prettier,vitest,playwright,husky";

function uncovered(table: Table, set: Combination[]): string[] {
  return uncoveredPairs(
    dimensionsOfTable(table),
    set.map((combination) => rowOf(table, combination)),
  );
}

/** init's table with one more package manager, ready or not. */
function withPackageManager(option: {
  value: string;
  label: string;
  comingLater?: true;
}): Table {
  return {
    ...choiceTable,
    packageManager: {
      ...choiceTable.packageManager,
      options: [...choiceTable.packageManager.options, option],
    },
  };
}

describe("the pull request set", () => {
  const set = pullRequestSet();

  it("holds every pair of options from two different choices", () => {
    expect(uncovered(choiceTable, set)).toEqual([]);
  });

  it("makes far fewer installs than the full matrix", () => {
    // Four UI options by three package managers or ORMs is 12 rows at
    // least. Every combination is 72, before the tools.
    expect(set.length).toBeLessThanOrEqual(16);
  });

  it("starts with an install with every tool and one with none", () => {
    expect(
      set.slice(0, 2).map((combination) => combination.flags.tools),
    ).toEqual([allTools, "none"]);
  });

  it("makes installs on bun", () => {
    expect(
      set.filter((combination) => combination.flags.pm === "bun").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("names each install by the flags that make it, which init takes", () => {
    const [first] = set;

    expect(first?.name).toBe(
      `--pm pnpm --orm drizzle --ui-kit none --generators start,react-hono --tools ${allTools}`,
    );
    expect(new Set(set.map((combination) => combination.name)).size).toBe(
      set.length,
    );
    for (const combination of set) {
      expect(() => choicesFromFlags(combination.flags as Flags)).not.toThrow();
    }
  });

  it("grows to cover an option the table adds", () => {
    const table = withPackageManager({ value: "deno", label: "Deno" });

    const grown = pullRequestSet(table);

    expect(uncovered(table, grown)).toEqual([]);
    expect(
      grown.filter((combination) => combination.flags.pm === "deno").length,
    ).toBeGreaterThanOrEqual(4);
    expect(grown.length).toBeGreaterThanOrEqual(set.length);
  });

  it("leaves out an option that is coming later", () => {
    const table = withPackageManager({
      value: "deno",
      label: "Deno",
      comingLater: true,
    });

    expect(pullRequestSet(table)).toEqual(set);
  });
});

describe("the nightly set", () => {
  const set = nightlySet();

  it("makes every combination of package manager, ORM, UI kit and first stack once", () => {
    const answers = set.map(
      ({ flags }) =>
        `${flags.pm ?? ""} ${flags.orm ?? ""} ${flags["ui-kit"] ?? ""} ${flags.generators ?? ""}`,
    );

    expect(set).toHaveLength(72);
    expect(new Set(answers).size).toBe(72);
  });

  it("holds every pair of options, the tools included", () => {
    expect(uncovered(choiceTable, set)).toEqual([]);
  });

  it("has an install with every tool and one with none", () => {
    const tools = set.map((combination) => combination.flags.tools);

    expect(tools).toContain(allTools);
    expect(tools).toContain("none");
  });

  it("grows by a third with a fourth package manager", () => {
    expect(
      nightlySet(withPackageManager({ value: "deno", label: "Deno" })),
    ).toHaveLength(96);
  });
});
