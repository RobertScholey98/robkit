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

  it("shows a value another workspace package exports as a re-export, not its source", async () => {
    const dir = await builtPackage({
      "package.json": JSON.stringify({
        name: "@robkit/x",
        type: "module",
        publishConfig: {
          exports: {
            "./cli": { types: "./dist/cli.d.ts", default: "./dist/cli.js" },
          },
        },
      }),
      "dist/cli.d.ts": 'export { run, type Run } from "@robkit/y/command";\n',
      // In the workspace a package's exports point at its source.
      "node_modules/@robkit/y/package.json": JSON.stringify({
        name: "@robkit/y",
        type: "module",
        exports: { "./command": "./src/command.ts" },
      }),
      "node_modules/@robkit/y/src/command.ts": [
        "export type Run = () => number;",
        "export function run(code: number): number {",
        "  return code;",
        "}",
      ].join("\n"),
    });

    expect(await apiReport(dir)).toContain(
      [
        "```ts",
        'export { run } from "@robkit/y/command";',
        "export type Run = () => number;",
        "```",
      ].join("\n"),
    );
  });
});

describe("each published package's api-report.md", async () => {
  // Fails when the built API differs from the checked-in report. Run
  // `pnpm --filter @internal/repo-checks api:update` and commit the report.
  const dirs = await publishedPackages();
  it.each(dirs.map((dir) => [`packages/${basename(dir)}`, dir]))(
    "%s matches its built API",
    async (folder, dir) => {
      await expect(
        await apiReport(dir),
        `${folder}'s API changed. Run pnpm --filter @internal/repo-checks api:update and commit its api-report.md.`,
      ).toMatchFileSnapshot(join(dir, "api-report.md"));
    },
    // Each report takes 3 to 25 seconds on a CI runner, while the suite's
    // other files pack and build beside it. One passed the suite's 30.
    120_000,
  );
});
