import { join } from "node:path";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import { config } from "./index.js";

const here = import.meta.dirname;

/**
 * Lints `code` as a JavaScript file with the shared config, and returns the
 * rule of each problem that fails lint. A directive that disables nothing has
 * no rule.
 * @param {string} code
 */
function lint(code) {
  return new Linter({ cwd: here })
    .verify(code, config(here), join(here, "example.js"))
    .filter((m) => m.severity === 2)
    .map((m) => m.ruleId);
}

describe("lint suppressions", () => {
  it("accept a disable comment that gives a reason and disables something", () => {
    expect(
      lint(
        "// eslint-disable-next-line no-debugger -- stops here on purpose\ndebugger;\n",
      ),
    ).toEqual([]);
  });

  it("fail a disable comment without a reason", () => {
    expect(
      lint("// eslint-disable-next-line no-debugger\ndebugger;\n"),
    ).toEqual(["@eslint-community/eslint-comments/require-description"]);
  });

  it("fail a disable comment that disables nothing", () => {
    expect(
      lint(
        "// eslint-disable-next-line no-debugger -- nothing to stop\nexport const a = 1;\n",
      ),
    ).toEqual([null]);
  });
});
