import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import rule from "./no-bare-error.js";

const bare =
  "This error's message is fixed text with no cause. Name what was tried, such as the table, key, file or attempt count, or pass the error underneath as { cause }. See robkit's docs/conventions/errors.md.";

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
          plugins: { robkit: { rules: { "no-bare-error": rule } } },
          rules: { "robkit/no-bare-error": "error" },
        },
      ],
      "src/store.ts",
    )
    .map((m) => m.message);
}

describe("robkit/no-bare-error", () => {
  it.each([
    'throw new Error("Core couldn\'t store the session.");',
    "throw new Error('Core couldn\\'t store the session.');",
    "throw new Error(`Core couldn't store the session.`);",
    "throw new Error();",
    'if (!row) { throw new Error("No row."); }',
    'throw Error("Core couldn\'t store the session.");',
    "throw Error();",
  ])("refuses `%s`", (code) => {
    expect(lint(code)).toEqual([bare]);
  });

  it.each([
    [
      "a message that names what was tried",
      "throw new Error(`Core couldn't store the session in ${table}.`);",
    ],
    [
      "a fixed message with a cause",
      'try { f(); } catch (error) { throw new Error("Core couldn\'t start.", { cause: error }); }',
    ],
    ["a message built elsewhere", "throw new Error(message);"],
    [
      "a call without new that names what was tried",
      "throw Error(`No row in ${table}.`);",
    ],
    ["a function that builds the error", 'throw makeError("No row.");'],
    ["a message joined from parts", 'throw new Error("Core " + reason);'],
    [
      "a problem the person can fix",
      'throw new CommandProblem("Set COOLIFY_TOKEN to deploy.");',
    ],
    ["another error class", 'throw new TypeError("Expected a string.");'],
    [
      "an error that isn't thrown here",
      'reject(new Error("The server stopped."));',
    ],
    ["rethrowing", "try { f(); } catch (error) { throw error; }"],
  ])("allows %s", (_, code) => {
    expect(lint(code)).toEqual([]);
  });
});
