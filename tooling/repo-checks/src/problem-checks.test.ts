import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { codeIn, readCodeAndDocs, typeofReadChecks } from "./problem-checks.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

const lines = (...code: string[]) => code.join("\n");

describe("typeofReadChecks", () => {
  it("finds a reader's result guarded with typeof", () => {
    const text = lines(
      "const core = readCoreUrl(process.env);",
      'if (typeof core !== "string") throw new Error(core.error);',
      "const url = readDatabaseUrl(process.env);",
      'if (typeof url !== "string") process.exit(1);',
    );

    expect(typeofReadChecks(text)).toEqual(["core", "url"]);
  });

  it.each([
    [
      "an awaited call",
      lines(
        "const core = await readCoreUrl(env);",
        'if (typeof core !== "string") throw new Error(core.error);',
      ),
    ],
    [
      "a reader imported under another name",
      lines(
        'import { readCoreUrl as coreUrl } from "@robkit/input";',
        "const core = coreUrl(env);",
        'if (typeof core !== "string") throw new Error(core.error);',
      ),
    ],
    [
      "a reader called through its module",
      lines(
        'import * as input from "@robkit/input";',
        "const core = input.readCoreUrl(env);",
        'if (typeof core !== "string") throw new Error(core.error);',
      ),
    ],
    [
      "a declaration split over lines",
      lines(
        "const core =",
        "  readCoreUrl(env);",
        'if (typeof core !== "string") throw new Error(core.error);',
      ),
    ],
    [
      "a declaration and a later assignment",
      lines(
        "let core;",
        "core = readCoreUrl(env);",
        'if (typeof core !== "string") throw new Error(core.error);',
      ),
    ],
    [
      "the check written the other way round",
      lines(
        "const core = readCoreUrl(env);",
        'if ("string" != typeof core) throw new Error(core.error);',
      ),
    ],
    [
      "a check in a nested function",
      lines(
        "export function start(env: Env) {",
        "  const core = readCoreUrl(env);",
        "  return () => {",
        '    if (typeof (core) !== "string") throw new Error(core.error);',
        "  };",
        "}",
      ),
    ],
  ])("finds %s", (_, text) => {
    expect(typeofReadChecks(text)).toEqual(["core"]);
  });

  it("reads TSX", () => {
    const text = lines(
      "const core = readCoreUrl(env);",
      'if (typeof core !== "string") throw new Error(core.error);',
      "export const page = <main>{core}</main>;",
    );

    expect(typeofReadChecks(text, "tsx")).toEqual(["core"]);
  });

  it("passes a reader's result checked with isProblem", () => {
    const text = lines(
      "const core = readCoreUrl(process.env);",
      "if (isProblem(core)) throw new Error(core.error);",
      // typeof on something no reader returned is fine, and so is
      // narrowing a result to read it further.
      "const name = form.get('name');",
      'if (typeof name !== "string") return;',
      "const secret = readSet(env, 'SECRET', fix);",
      'const short = typeof secret === "string" && secret.length < 32;',
      // Words in a comment or a string aren't code.
      '// const url = readDatabaseUrl(env); if (typeof url !== "string") ...',
      'const hint = "const host = readHost(env); typeof host !== \\"string\\"";',
    );

    expect(typeofReadChecks(text)).toEqual([]);
  });

  it("passes a call that isn't a reader's", () => {
    const text = lines(
      'import { readFile as load } from "./files.ts";',
      'import { thread } from "./threads.ts";',
      "const spool = thread(env);",
      'if (typeof spool !== "string") throw new Error("No spool.");',
    );

    expect(typeofReadChecks(text)).toEqual([]);
  });
});

describe("codeIn", () => {
  it("is a TypeScript file's whole text", () => {
    expect(codeIn({ file: "src/a.ts", text: "const a = 1;\n" })).toEqual([
      { code: "const a = 1;\n", kind: "ts" },
    ]);
    expect(codeIn({ file: "src/a.tsx", text: "<a />\n" })).toEqual([
      { code: "<a />\n", kind: "tsx" },
    ]);
  });

  it("is each ts and tsx fence in a doc, nocheck ones included", () => {
    const text = lines(
      "# A doc",
      "```ts",
      "const a = 1;",
      "```",
      "```ts nocheck",
      "const b = readB(env);",
      "```",
      "```sh",
      "pnpm check",
      "```",
      "```tsx",
      "<c />",
      "```",
    );

    expect(codeIn({ file: "docs/a.md", text })).toEqual([
      { code: "const a = 1;\n", kind: "ts" },
      { code: "const b = readB(env);\n", kind: "ts" },
      { code: "<c />\n", kind: "tsx" },
    ]);
  });
});

describe("robkit's code, templates and docs", () => {
  it("check every reader's result with isProblem", async () => {
    const found = (await readCodeAndDocs(root)).flatMap((scanned) =>
      codeIn(scanned).flatMap(({ code, kind }) =>
        typeofReadChecks(code, kind).map((name) => `${scanned.file}: ${name}`),
      ),
    );

    expect(found).toEqual([]);
  });
});
