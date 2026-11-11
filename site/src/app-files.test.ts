import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { appFiles, compareFileList } from "./app-files.ts";
import { repoRoot } from "./repo.ts";
import { templatesRoot } from "./templates.ts";

describe("compareFileList", () => {
  const entries = [
    {
      name: "src/",
      about: "",
      children: [
        { name: "a.ts", about: "" },
        { name: "b.ts", about: "" },
      ],
    },
    { name: "drizzle/", about: "" },
    { name: "package.json", about: "" },
  ];

  it("passes a list that names each file, or a folder above it", () => {
    expect(
      compareFileList(entries, [
        "src/a.ts",
        "src/b.ts",
        "drizzle/0000_init.sql",
        "drizzle/meta/_journal.json",
        "package.json",
      ]),
    ).toEqual({ unlisted: [], missing: [] });
  });

  it("names a file the folder gained and an entry it lost", () => {
    expect(
      compareFileList(entries, [
        "src/a.ts",
        "src/c.ts",
        "README.md",
        "package.json",
      ]),
    ).toEqual({
      unlisted: ["src/c.ts", "README.md"],
      missing: ["src/b.ts", "drizzle/"],
    });
  });
});

/** Every file under `dir`, from it, with forward slashes. */
async function filesIn(dir: string): Promise<string[]> {
  const found = await readdir(dir, { recursive: true, withFileTypes: true });
  return found
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    );
}

describe.each(Object.entries(appFiles))("the files of %s", (stack, entries) => {
  it("are the ones its template has", async () => {
    const files = await filesIn(join(repoRoot, templatesRoot, "stacks", stack));

    expect(compareFileList(entries, files)).toEqual({
      unlisted: [],
      missing: [],
    });
  });
});
