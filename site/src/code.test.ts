import { describe, expect, it } from "vitest";
import { codeLabel, fenceTitle, isCommand } from "./code.ts";

describe("fenceTitle", () => {
  it("reads title from a fence's meta, in double or single quotes", () => {
    expect(fenceTitle('title="apps/notes/src/db.ts"')).toBe(
      "apps/notes/src/db.ts",
    );
    expect(fenceTitle("nocheck title='go.mod'")).toBe("go.mod");
  });

  it("is undefined with no meta, or no title in it", () => {
    expect(fenceTitle(undefined)).toBeUndefined();
    expect(fenceTitle("nocheck")).toBeUndefined();
    expect(fenceTitle('subtitle="x"')).toBeUndefined();
  });
});

describe("isCommand", () => {
  it("is true for a shell's languages only", () => {
    expect(["sh", "bash", "shell", "ts", "go", ""].map(isCommand)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe("codeLabel", () => {
  it("is the file's name when the block has one", () => {
    expect(codeLabel("ts", "apps/notes/src/db.ts")).toBe(
      "apps/notes/src/db.ts",
    );
  });

  it("names a command block Terminal, and other code by its language", () => {
    expect(
      ["sh", "ts", "tsx", "go", "json", "yaml", "sql", "toml"].map((lang) =>
        codeLabel(lang),
      ),
    ).toEqual([
      "Terminal",
      "TypeScript",
      "TSX",
      "Go",
      "JSON",
      "YAML",
      "SQL",
      "toml",
    ]);
  });

  it("is empty for code with no language", () => {
    expect(codeLabel("")).toBe("");
  });
});
