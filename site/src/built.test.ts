import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { builtParts } from "./built.ts";
import { repoRoot } from "./repo.ts";

const repoFile = (path: string) => readFile(join(repoRoot, path), "utf8");

describe("the parts built from the repo's files", () => {
  it("has a heading for every term in GLOSSARY.md", async () => {
    const glossary = await repoFile("GLOSSARY.md");
    const terms = [...glossary.matchAll(/^\*\*(.+)\*\*:$/gm)].map(
      ([, term]) => `### ${String(term)}`,
    );

    expect(terms.length).toBeGreaterThan(20);
    expect(
      (await builtParts["concepts/glossary"]())
        .split("\n")
        .filter((line) => line.startsWith("### ")),
    ).toEqual(terms);
  });

  it("has each of SECURITY.md's known gaps", async () => {
    const security = await repoFile("SECURITY.md");
    const gaps = (await builtParts["known-gaps"]()).split("\n");

    expect(gaps.length).toBeGreaterThan(5);
    for (const gap of gaps) {
      expect(security).toContain(
        gap.replaceAll(
          "https://github.com/RobertScholey98/robkit/blob/main/",
          "",
        ),
      );
    }
    expect(gaps.join("\n")).not.toMatch(/\]\(\.scratch\//);
  });

  it("has each way past the lint SECURITY.md lists", async () => {
    const ways = (await builtParts["ways-past-the-lint"]()).split("\n");

    expect(ways).toContain("- `createRequire`.");
    expect(await repoFile("SECURITY.md")).toContain(ways.join("\n"));
  });
});
