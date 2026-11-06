import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import rule from "./one-problem-type.js";

const typeMessage =
  "A failed read is an InputProblem from @robkit/input, not a { error: string } of its own. See docs/conventions/input.md.";
const checkMessage =
  'Check a read with isProblem from @robkit/input, not "error" in. See docs/conventions/input.md.';

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
          plugins: { robkit: { rules: { "one-problem-type": rule } } },
          rules: { "robkit/one-problem-type": "error" },
        },
      ],
      "src/read.ts",
    )
    .map((m) => m.message);
}

describe("robkit/one-problem-type", () => {
  it.each([
    "function read(): number | { error: string } { return 1; }",
    "function read(): number | { readonly error: string } { return 1; }",
    'function read(): number | { "error": string } { return 1; }',
    "type Read = Promise<number | { error: string }>;",
    "const read = (fields: unknown): { error: string } => ({ error: '' });",
  ])("refuses a { error: string } of its own in `%s`", (code) => {
    expect(lint(code)).toEqual([typeMessage]);
  });

  it("accepts InputProblem and other shapes with an error", () => {
    expect(
      lint(
        'import type { InputProblem } from "@robkit/input";\nfunction read(): number | InputProblem { return 1; }',
      ),
    ).toEqual([]);
    expect(lint("type Answer = { error: string; status: number };")).toEqual(
      [],
    );
    expect(lint("type Answer = { error?: string };")).toEqual([]);
    expect(lint("type Answer = { error: number };")).toEqual([]);
    expect(lint("interface InputProblem { readonly error: string }")).toEqual(
      [],
    );
  });

  it.each([
    'if ("error" in read) {}',
    "if ('error' in read) {}",
    'const failed = !("error" in read);',
  ])("refuses `%s`", (code) => {
    expect(lint(code)).toEqual([checkMessage]);
  });

  it("accepts isProblem and other keys", () => {
    expect(lint("if (isProblem(read)) {}")).toEqual([]);
    expect(lint('if ("location" in body) {}')).toEqual([]);
    expect(lint("if (key in body) {}")).toEqual([]);
  });
});
