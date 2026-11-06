import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import rule from "./one-problem-type.js";

const typeMessage =
  "A failed read is an InputProblem from @robkit/input, not a { error: string } of its own. See robkit's docs/conventions/input.md.";
const checkMessage =
  'Check a read with isProblem from @robkit/input, not "error" in. See robkit\'s docs/conventions/input.md.';
const thrownMessage =
  "A problem the person can fix isn't a fault. Throw it as a CommandProblem in a command line, end an app server with orExit, or use orThrow where nothing better fits. See robkit's docs/conventions/input.md.";

/**
 * Lints `code` as a TypeScript file.
 * @param {string} code
 * @param {string} [filename]
 */
function lint(code, filename = "src/read.ts") {
  return new Linter()
    .verify(
      code,
      [
        {
          files: ["**/*.ts", "**/*.tsx"],
          languageOptions: { parser: tseslint.parser },
          plugins: { robkit: { rules: { "one-problem-type": rule } } },
          rules: { "robkit/one-problem-type": "error" },
        },
      ],
      filename,
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

  it.each([
    "if (isProblem(read)) throw new Error(read.error);",
    "throw new Error(parsed.error, { cause: reason });",
    "throw new Error(result.problem.error);",
  ])("refuses `%s`", (code) => {
    expect(lint(code)).toEqual([thrownMessage]);
  });

  it("accepts a problem thrown as a CommandProblem, and other errors", () => {
    expect(lint("throw new CommandProblem(read.error);")).toEqual([]);
    expect(lint("throw new Error(`${read.error} Try again.`);")).toEqual([]);
    expect(lint("throw new Error(read.message);")).toEqual([]);
    expect(lint('throw new Error(read["error"]);')).toEqual([]);
    expect(lint("const failure = new Error(read.error);")).toEqual([]);
  });

  it.each([
    "src/test/slug.ts",
    "src/read.test.ts",
    "src/read.test-d.ts",
    "src/page.test.tsx",
    ".t3/robkit/packages/core/src/test/slug.ts",
  ])("lets the test code in %s throw a problem", (filename) => {
    expect(lint("throw new Error(read.error);", filename)).toEqual([]);
  });
});
