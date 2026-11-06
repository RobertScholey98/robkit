import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import rule from "./no-brand-cast.js";

const message =
  "Only a reader makes a branded value. Call the reader, or in a test a builder from @internal/test-session or @internal/test-addresses, rather than casting.";

const brands = [
  "declare const roleIdBrand: unique symbol;",
  "type RoleId = string & { readonly [roleIdBrand]: true };",
  "declare const slugBrand: unique symbol;",
  'type Slug = "core" | "hub" | (string & { readonly [slugBrand]: true });',
  "type Rule = { kind: 'roles'; roles: RoleId[] } | { kind: 'open' };",
  "declare const text: string;",
  "declare const value: unknown;",
].join("\n");

// A folder of its own, so the project service has a tsconfig to type the
// linted file with.
const folder = mkdtempSync(join(tmpdir(), "no-brand-cast-"));
writeFileSync(
  join(folder, "tsconfig.json"),
  JSON.stringify({ compilerOptions: { strict: true }, include: ["*.ts"] }),
);
writeFileSync(join(folder, "example.test.ts"), "");

/**
 * Lints `code`, after the brand declarations, as a test file.
 * @param {string} code
 */
function lint(code) {
  return new Linter({ cwd: folder })
    .verify(
      `${brands}\n${code}\nexport {};\n`,
      [
        {
          files: ["**/*.ts"],
          languageOptions: {
            parser: tseslint.parser,
            parserOptions: { projectService: true, tsconfigRootDir: folder },
          },
          plugins: { robkit: { rules: { "no-brand-cast": rule } } },
          rules: { "robkit/no-brand-cast": "error" },
        },
      ],
      join(folder, "example.test.ts"),
    )
    .map((m) => m.message);
}

describe("robkit/no-brand-cast", () => {
  it.each([
    'const id = "family" as RoleId;',
    "const id = <RoleId>text;",
    'const id = "family" as unknown as RoleId;',
    'const ids = ["family"] as RoleId[];',
    'const slug = "notes" as Slug;',
  ])("refuses `%s`", (code) => {
    expect(lint(code)).toContain(message);
  });

  it("accepts a cast to a type that isn't a brand", () => {
    expect(lint("const read = value as { name: string };")).toEqual([]);
    expect(lint("const name = text as string;")).toEqual([]);
    expect(lint('const kind = "open" as const;')).toEqual([]);
    // A rule holds brands, but a test may still build a malformed one.
    expect(
      lint("const rule = { kind: 'everyone' } as unknown as Rule;"),
    ).toEqual([]);
  });
});
