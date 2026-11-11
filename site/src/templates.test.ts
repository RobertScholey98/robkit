import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";
import {
  installPath,
  langOf,
  templateFile,
  templatePart,
} from "./templates.ts";

describe("installPath", () => {
  it("puts a base file at the install's root, and a stack's in its app", () => {
    expect(installPath("base/compose.yaml")).toBe("compose.yaml");
    expect(installPath("base/apps/hub/src/main.ts")).toBe(
      "apps/hub/src/main.ts",
    );
    expect(installPath("stacks/go/main.go")).toBe("apps/example/main.go");
    expect(installPath("stacks/go/main.go", "notes")).toBe(
      "apps/notes/main.go",
    );
  });

  it("names a file npm would drop as the install has it", () => {
    expect(installPath("base/gitignore")).toBe(".gitignore");
  });

  it("refuses a path outside base and stacks", () => {
    expect(() => installPath("other/x.ts")).toThrow(
      'other/x.ts isn\'t under the templates\' "base/" or "stacks/<stack>/".',
    );
  });
});

describe("langOf", () => {
  it("is the language Shiki knows the file by", () => {
    expect(
      [
        "a.ts",
        "a.tsx",
        "a.js",
        "a.go",
        "go.mod",
        "a.json",
        "a.yaml",
        "a.yml",
        "a.sql",
        "a.md",
        "Dockerfile",
        "gitignore",
      ].map(langOf),
    ).toEqual([
      "ts",
      "tsx",
      "js",
      "go",
      "go",
      "json",
      "yaml",
      "yaml",
      "sql",
      "md",
      "dockerfile",
      "text",
    ]);
  });
});

const file = [
  "package main",
  "",
  "func main() {",
  "\tserve()",
  "}",
  "",
  "func serve() {",
  "\tif ok {",
  "\t\tlisten()",
  "\t}",
  "}",
  "",
].join("\n");

describe("templatePart", () => {
  it("is the whole file, less its last newline, without from and to", () => {
    expect(templatePart(file, {}, "x")).toBe(file.slice(0, -1));
  });

  it("runs from the line with from to the next line with to, both kept", () => {
    expect(templatePart(file, { from: "func serve", to: "}" }, "x")).toBe(
      "func serve() {\n\tif ok {\n\t\tlisten()\n\t}",
    );
    expect(templatePart(file, { from: "func serve", to: "^}" }, "x")).toBe(
      "func serve() {\n\tif ok {\n\t\tlisten()\n\t}\n}",
    );
  });

  it("takes off the indent the part's lines share", () => {
    expect(templatePart(file, { from: "if ok", to: "\t}" }, "x")).toBe(
      "if ok {\n\tlisten()\n}",
    );
  });

  it("runs to the end of the file with only from", () => {
    expect(templatePart(file, { from: "func serve" }, "x")).toBe(
      "func serve() {\n\tif ok {\n\t\tlisten()\n\t}\n}",
    );
  });

  it("fails, naming where, on a from no line has, or more than one has", () => {
    expect(() => templatePart(file, { from: "nothing" }, "/docs/a/")).toThrow(
      '/docs/a/: no line has "nothing". Name a line the part starts on.',
    );
    expect(() => templatePart(file, { from: "func" }, "/docs/a/")).toThrow(
      '/docs/a/: 2 lines have "func". Name text only the first line of the part has.',
    );
  });

  it("fails on a to no line after from has", () => {
    expect(() =>
      templatePart(file, { from: "func serve", to: "return" }, "/docs/a/"),
    ).toThrow('/docs/a/: no line from "func serve" on has "return".');
  });
});

describe("templateFile", () => {
  it("reads a template as an install gets it, with LF line ends", async () => {
    const path = "stacks/go/go.mod";
    const text = await readFile(
      join(repoRoot, "packages/create-robkit/templates", path),
      "utf8",
    );

    await expect(templateFile(path, "/docs/a/")).resolves.toBe(
      text.replaceAll("\r\n", "\n").replace(/\n$/, ""),
    );
  });

  it("fails on a path that doesn't exist, naming the page", async () => {
    await expect(templateFile("stacks/go/nope.go", "/docs/a/")).rejects.toThrow(
      "/docs/a/ shows packages/create-robkit/templates/stacks/go/nope.go, which doesn't exist. Check the path from packages/create-robkit/templates.",
    );
  });
});
