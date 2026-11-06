import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCodeAndDocs, typeofReadChecks } from "./problem-checks.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("typeofReadChecks", () => {
  it("finds a reader's result guarded with typeof", () => {
    const text = [
      "const core = readCoreUrl(process.env);",
      'if (typeof core !== "string") throw new Error(core.error);',
      "const url = readDatabaseUrl(process.env);",
      'if (typeof url !== "string") process.exit(1);',
    ].join("\n");

    expect(typeofReadChecks(text)).toEqual(["core", "url"]);
  });

  it("passes a reader's result checked with isProblem", () => {
    const text = [
      "const core = readCoreUrl(process.env);",
      "if (isProblem(core)) throw new Error(core.error);",
      // typeof on something no reader returned is fine, and so is
      // narrowing a result to read it further.
      "const name = form.get('name');",
      'if (typeof name !== "string") return;',
      "const secret = readSet(env, 'SECRET', fix);",
      'const short = typeof secret === "string" && secret.length < 32;',
    ].join("\n");

    expect(typeofReadChecks(text)).toEqual([]);
  });
});

describe("robkit's code, templates and docs", () => {
  it("check every reader's result with isProblem", async () => {
    const found = (await readCodeAndDocs(root)).flatMap(({ file, text }) =>
      typeofReadChecks(text).map((name) => `${file}: ${name}`),
    );

    expect(found).toEqual([]);
  });
});
