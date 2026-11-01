import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Linter } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import rule from "./relative-import-extension.js";

const message =
  "Relative imports use the .ts extension, so Node can run source files directly.";

/** @type {string} */
let root;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "relative-import-extension-"));
  for (const file of [
    "src/index.ts",
    "src/session.ts",
    "src/view.tsx",
    "src/vite.config.ts",
    "src/legacy.js",
    "src/styles.css",
    "src/nested/deep.ts",
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), "");
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Lints `code` as the source of `file` under the temp root.
 * @param {string} code
 * @param {string} [file]
 */
function lint(code, file = "src/index.ts") {
  return new Linter({ cwd: root })
    .verify(
      code,
      [
        {
          files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.js"],
          plugins: {
            robkit: { rules: { "relative-import-extension": rule } },
          },
          rules: { "robkit/relative-import-extension": "error" },
        },
      ],
      join(root, file),
    )
    .map((m) => m.message);
}

describe("robkit/relative-import-extension", () => {
  it("wants an extension on a relative import", () => {
    expect(lint('import "./session";')).toEqual([message]);
    expect(lint('import "./session.ts";')).toEqual([]);
  });

  it.each([
    'export { session } from "./session";',
    'export * from "./session";',
    'await import("./session");',
    'import "../src/session";',
  ])("checks %s", (code) => {
    expect(lint(code)).toEqual([message]);
    expect(lint(code.replace(`session"`, `session.ts"`))).toEqual([]);
  });

  it("checks imports from a nested folder", () => {
    expect(lint('import "../session";', "src/nested/deep.ts")).toEqual([
      message,
    ]);
    expect(lint('import "../session.ts";', "src/nested/deep.ts")).toEqual([]);
  });

  it("wants .ts, not .js, when the source is TypeScript", () => {
    expect(lint('import "./session.js";')).toEqual([message]);
    expect(lint('import "./view.jsx";')).toEqual([message]);
    expect(lint('import "./view.tsx";')).toEqual([]);
  });

  it("accepts .js when the file really is JavaScript", () => {
    expect(lint('import "./legacy.js";')).toEqual([]);
    expect(lint('import "./legacy";')).toEqual([message]);
  });

  it("reads a dotted name as missing its extension when a .ts file has it", () => {
    expect(lint('import "./vite.config";')).toEqual([message]);
    expect(lint('import "./vite.config.ts";')).toEqual([]);
  });

  it("accepts non-code extensions", () => {
    expect(lint('import "./styles.css";')).toEqual([]);
    expect(lint('import "./styles";')).toEqual([message]);
  });

  it("leaves package imports alone", () => {
    expect(lint('import "hono";')).toEqual([]);
    expect(lint('import "./session";')).toEqual([message]);
  });

  it("only checks TypeScript files", () => {
    expect(lint('import "./session";', "src/legacy.js")).toEqual([]);
    expect(lint('import "./session";', "src/view.tsx")).toEqual([message]);
  });

  it("skips dynamic imports of a computed path", () => {
    expect(lint("const name = './session'; await import(name);")).toEqual([]);
    expect(lint("await import('./session');")).toEqual([message]);
  });
});
