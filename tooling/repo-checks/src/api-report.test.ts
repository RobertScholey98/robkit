import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { apiReport } from "./api-report.ts";
import { publishedPackages } from "./published.ts";

/** A built package: its manifest and its declaration files. */
async function builtPackage(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "robkit-api-"));
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(dir, path, ".."), { recursive: true });
    await writeFile(join(dir, path), text);
  }
  return dir;
}

describe("apiReport", () => {
  it("lists each typed entry's exports with their types, sorted, without comments", async () => {
    const dir = await builtPackage({
      "package.json": JSON.stringify({
        name: "@robkit/x",
        type: "module",
        exports: { ".": "./src/index.ts" },
        publishConfig: {
          exports: {
            ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
            "./data.json": "./data.json",
            "./small": {
              types: "./dist/small.d.ts",
              default: "./dist/small.js",
            },
          },
        },
      }),
      "dist/index.d.ts": [
        "/** Says hello. */",
        "export declare function hello(name: string): string;",
        "export interface Greeting {",
        "    /** Who it greets. */",
        "    name: string;",
        "}",
        "export declare const version: string;",
        'export declare const path = "/_robkit/x";',
        'export { hello as greet } from "./index.js";',
      ].join("\n"),
      "dist/small.d.ts": "export {};\n",
    });

    expect(await apiReport(dir)).toBe(
      [
        "# @robkit/x API",
        "",
        "Generated from the built declarations by `tooling/repo-checks`. A change to the package's public API changes this file, so it shows up in review. `pnpm --filter @internal/repo-checks api:update` rewrites it.",
        "",
        "## @robkit/x",
        "",
        "```ts",
        "// Exported as greet.",
        "export function hello(name: string): string;",
        "export interface Greeting {",
        "  name: string;",
        "}",
        "export function hello(name: string): string;",
        'export const path: "/_robkit/x";',
        "export const version: string;",
        "```",
        "",
        "## @robkit/x/small",
        "",
        "```ts",
        "// Exports nothing.",
        "```",
        "",
      ].join("\n"),
    );
  });
});

describe("each published package's api-report.md", async () => {
  // Fails when the built API differs from the checked-in report. Run
  // `pnpm --filter @internal/repo-checks api:update` and commit the report.
  it.each(await publishedPackages())(
    "matches the API %s builds",
    async (dir) => {
      await expect(
        await apiReport(dir),
        `${basename(dir)}'s API changed. Run pnpm --filter @internal/repo-checks api:update and commit api-report.md.`,
      ).toMatchFileSnapshot(join(dir, "api-report.md"));
    },
  );
});
