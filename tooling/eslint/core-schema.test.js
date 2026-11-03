import { join } from "node:path";
import { Linter } from "eslint";
import { describe, expect, it } from "vitest";
import coreSchema from "./core-schema.js";
import { repoRoot } from "./layers.js";

/**
 * Lints `code` as `src/schema.ts` in `workspace`.
 * @param {string} workspace
 * @param {string} code
 */
function lint(workspace, code) {
  return new Linter({ cwd: repoRoot })
    .verify(
      code,
      [
        {
          files: ["**/*.ts"],
          plugins: { robkit: { rules: { "core-schema": coreSchema } } },
          rules: { "robkit/core-schema": "error" },
        },
      ],
      join(repoRoot, workspace, "src/schema.ts"),
    )
    .map((m) => m.message);
}

const message =
  "Core's tables live in the core schema. Declare them with core.table() from schema.ts.";

describe("core's schema rule", () => {
  it("refuses pgTable in core, and allows it elsewhere", () => {
    const code = 'import { pgTable, uuid } from "drizzle-orm/pg-core";';

    expect(lint("packages/core", code)).toEqual([message]);
    expect(lint("packages/dev", code)).toEqual([]);
  });

  it.each([
    'import { pgSchema } from "drizzle-orm/pg-core"; pgSchema("other");',
    'import { pgSchema } from "drizzle-orm/pg-core"; pgSchema(name);',
    'import { pgSchema } from "drizzle-orm/pg-core"; pgSchema();',
    'import { pgSchema as s } from "drizzle-orm/pg-core"; s("other");',
    'import * as pg from "drizzle-orm/pg-core"; pg.pgSchema("other");',
    'import * as pg from "drizzle-orm/pg-core"; pg.pgTable("t", {});',
  ])("refuses `%s` in core", (code) => {
    expect(lint("packages/core", code)).toEqual([message]);
    expect(lint("packages/dev", code)).toEqual([]);
  });

  it("leaves a pgSchema that isn't Drizzle's alone", () => {
    expect(lint("packages/core", 'pgSchema("other");')).toEqual([]);
  });

  it('allows pgSchema("core") in core', () => {
    expect(
      lint(
        "packages/core",
        'import { pgSchema } from "drizzle-orm/pg-core"; pgSchema("core");',
      ),
    ).toEqual([]);
  });
});
