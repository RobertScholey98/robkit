import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import rule from "./no-silent-catch.js";

const message =
  "This catch discards its error. Use it (translate, log or rethrow with cause), or say in a comment why dropping it is right.";

/**
 * Lints `code` with only robkit/no-silent-catch on.
 * @param {string} code
 */
function lint(code) {
  return new Linter()
    .verify(code, [
      {
        plugins: { robkit: { rules: { "no-silent-catch": rule } } },
        rules: { "robkit/no-silent-catch": "error" },
      },
    ])
    .map((m) => m.message);
}

describe("robkit/no-silent-catch", () => {
  it("fails a catch with no binding and no comment", () => {
    expect(lint("try { f(); } catch { g(); }")).toEqual([message]);
  });

  it("fails a catch whose binding goes unused", () => {
    expect(lint("try { f(); } catch (error) { g(); }")).toEqual([message]);
  });

  it("accepts a catch that uses its error", () => {
    expect(lint("try { f(); } catch (error) { log(error); }")).toEqual([]);
    expect(
      lint(
        "try { f(); } catch (error) { throw new Error('x', { cause: error }); }",
      ),
    ).toEqual([]);
  });

  it("accepts a catch with a comment saying why", () => {
    expect(
      lint(
        "try { f(); } catch {\n  // A missing file means no config.\n  g();\n}",
      ),
    ).toEqual([]);
    expect(lint("try { f(); } catch { /* best effort */ }")).toEqual([]);
  });

  it("fails a .catch handler that drops its error", () => {
    expect(lint("p.catch(() => undefined);")).toEqual([message]);
    expect(lint("p.catch((error) => undefined);")).toEqual([message]);
    expect(lint("p.catch(function () { return 1; });")).toEqual([message]);
  });

  it("accepts a .catch handler that uses its error", () => {
    expect(lint("p.catch((error) => String(error));")).toEqual([]);
  });

  it("accepts a .catch handler with a comment, inside it or before the statement", () => {
    expect(lint("p.catch(() => {\n  // Gone already.\n});")).toEqual([]);
    expect(
      lint("// Already gone is fine.\nawait p.catch(() => undefined);"),
    ).toEqual([]);
    expect(
      lint(
        "// Unreadable means none.\nconst x = await p.catch(() => undefined);",
      ),
    ).toEqual([]);
  });

  it("doesn't count a comment further up the file", () => {
    expect(lint("// Unrelated.\nf();\np.catch(() => undefined);")).toEqual([
      message,
    ]);
  });

  it("leaves a .catch that passes a named handler alone", () => {
    expect(lint("p.catch(report);")).toEqual([]);
  });
});
