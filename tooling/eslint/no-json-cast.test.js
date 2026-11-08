import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import rule from "./no-json-cast.js";

const message =
  "Parsed JSON is unknown until a reader checks it. Read it with one rather than casting it. See robkit's docs/conventions/input.md.";

/**
 * Lints `code` as a TypeScript file.
 * @param {string} code
 */
function lint(code) {
  return new Linter()
    .verify(
      code,
      [
        {
          files: ["**/*.ts"],
          languageOptions: { parser: tseslint.parser },
          plugins: { robkit: { rules: { "no-json-cast": rule } } },
          rules: { "robkit/no-json-cast": "error" },
        },
      ],
      "src/read.ts",
    )
    .map((m) => m.message);
}

describe("robkit/no-json-cast", () => {
  it.each([
    "const read = JSON.parse(text) as { name: string };",
    "const read = JSON.parse(text) as unknown;",
    "const read = <number[]>JSON.parse(text);",
    "const id = (JSON.parse(text) as { id: string }).id;",
    "const read = (await response.json()) as { name: string };",
    "const read = (await c.req.json()) as unknown;",
    "const read = response.json() as Promise<string>;",
    "const read = JSON.parse(text)! as string;",
  ])("refuses `%s`", (code) => {
    expect(lint(code)).toEqual([message]);
  });

  it("accepts a parse that a reader reads", () => {
    expect(lint("const read = readThing(JSON.parse(text));")).toEqual([]);
    expect(lint("const json: unknown = await response.json();")).toEqual([]);
    expect(lint("const read = parse(text) as Thing;")).toEqual([]);
    expect(lint("const read = value as Thing;")).toEqual([]);
    expect(lint("const read = JSON.stringify(text) as string;")).toEqual([]);
  });
});
