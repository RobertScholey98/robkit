import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { choiceTable, readyOptions } from "./choices.ts";

/** The package a CSS `@import` names: `shadcn` for `shadcn/tailwind.css`. */
function packageOf(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : (parts[0] ?? "");
}

const kits = readyOptions(choiceTable.uiKit).flatMap((kit) =>
  kit.value === "none" ? [] : [[kit.value, kit.layer ?? ""] as const],
);

describe.each(kits)("the %s kit's packages/ui", (_, layer) => {
  it("declares every package its stylesheet imports", async () => {
    const at = (path: string) =>
      new URL(`../templates/${layer}/packages/ui/${path}`, import.meta.url);
    const styles = await readFile(at("src/styles.css"), "utf8");
    const { dependencies } = JSON.parse(
      await readFile(at("package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };

    const imported = [...styles.matchAll(/^@import "([^."][^"]*)";/gm)].map(
      ([, specifier]) => packageOf(specifier ?? ""),
    );

    expect(imported).toContain("tailwindcss");
    // A package finds only what it declares.
    expect(imported.filter((name) => !(name in dependencies))).toEqual([]);
  });
});
