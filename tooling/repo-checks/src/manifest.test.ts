import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readJsonFile, readManifest, readNamedManifest } from "./manifest.ts";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "robkit-manifest-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("readJsonFile", () => {
  it("reads a JSON file with a reader", async () => {
    const path = join(dir, "good.json");
    await writeFile(path, '{"name": "@robkit/guard"}');
    expect(await readJsonFile(path, readNamedManifest)).toEqual({
      name: "@robkit/guard",
    });
  });

  it("throws naming the file when it isn't JSON", async () => {
    const path = join(dir, "broken.json");
    await writeFile(path, "{");
    await expect(readJsonFile(path, readManifest)).rejects.toThrow(
      `${path} isn't valid JSON`,
    );
  });

  it("throws the reader's problem when the shape won't do", async () => {
    const path = join(dir, "nameless.json");
    await writeFile(path, "{}");
    await expect(readJsonFile(path, readNamedManifest)).rejects.toThrow(
      `${path} needs a "name", the package's name.`,
    );
  });
});

describe("readManifest", () => {
  it("keeps the fields repo checks read and drops the rest", () => {
    expect(
      readManifest(
        {
          name: "@robkit/session",
          private: true,
          version: "0.0.0",
          scripts: { test: "vitest run" },
          dependencies: { "@robkit/guard": "workspace:*" },
          devDependencies: { vitest: "catalog:" },
          peerDependencies: { react: "^19.0.0" },
          optionalDependencies: { fsevents: "catalog:" },
          exports: { ".": "./src/index.ts" },
          publishConfig: {
            exports: { ".": { types: "./dist/index.d.ts" } },
          },
          bin: { robkit: "./src/robkit-command.ts" },
        },
        "package.json",
      ),
    ).toEqual({
      name: "@robkit/session",
      private: true,
      version: "0.0.0",
      scripts: { test: "vitest run" },
      dependencies: { "@robkit/guard": "workspace:*" },
      devDependencies: { vitest: "catalog:" },
      peerDependencies: { react: "^19.0.0" },
      optionalDependencies: { fsevents: "catalog:" },
      exports: { ".": "./src/index.ts" },
      publishConfig: { exports: { ".": { types: "./dist/index.d.ts" } } },
      bin: { robkit: "./src/robkit-command.ts" },
    });
  });

  it("reads a manifest with none of them as empty", () => {
    expect(readManifest({}, "package.json")).toEqual({});
  });

  it.each([
    [null, "package.json must be a JSON object."],
    [[], "package.json must be a JSON object."],
    [{ name: 1 }, 'package.json\'s "name" must be a string.'],
    [{ version: 1 }, 'package.json\'s "version" must be a string.'],
    [{ private: "yes" }, 'package.json\'s "private" must be true or false.'],
    [
      { dependencies: { hono: 4 } },
      'package.json\'s "dependencies" must map names to strings.',
    ],
    [
      { scripts: ["test"] },
      'package.json\'s "scripts" must map names to strings.',
    ],
    [
      { exports: "./index.js" },
      'package.json\'s "exports" must map each subpath to a file or to conditions naming files.',
    ],
    [
      { exports: { ".": { types: 1 } } },
      'package.json\'s "exports" must map each subpath to a file or to conditions naming files.',
    ],
    [
      { publishConfig: { exports: [] } },
      'package.json\'s "publishConfig.exports" must map each subpath to a file or to conditions naming files.',
    ],
    [
      { publishConfig: 1 },
      'package.json\'s "publishConfig" must be an object.',
    ],
  ])("refuses %j", (json, error) => {
    expect(readManifest(json, "package.json")).toEqual({ error });
  });
});
