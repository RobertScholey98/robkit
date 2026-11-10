import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { readJsonFile, readNamedManifest } from "./manifest.ts";
import {
  attwProblems,
  pack,
  packProblems,
  publishedPackages,
  publintProblems,
  templateTestProblems,
  templateTests,
  type Packed,
} from "./published.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** A packed package with nothing wrong, for a test to spoil one way. */
const sound = {
  name: "@robkit/x",
  targets: ["./dist/index.js"],
  files: ["package.json", "dist/index.js", "src/index.ts"],
};

describe("packProblems", () => {
  it("finds nothing wrong with a sound package", () => {
    expect(packProblems(sound)).toEqual([]);
  });

  it("names a target that is TypeScript source, or missing", () => {
    expect(
      packProblems({
        ...sound,
        targets: ["./src/index.ts", "./dist/index.d.ts", "./dist/gone.js"],
        files: ["package.json", "src/index.ts", "dist/index.d.ts"],
      }),
    ).toEqual([
      "@robkit/x points at TypeScript source: ./src/index.ts",
      "@robkit/x lacks ./dist/gone.js",
    ]);
  });

  it("names each of robkit's own test files in the tarball", () => {
    expect(
      packProblems({
        ...sound,
        files: [
          ...sound.files,
          "src/index.test.ts",
          "src/types.test-d.ts",
          "src/view.test.tsx",
          "src/test/fake-core.ts",
          "src/testing.ts",
        ],
      }),
    ).toEqual([
      "@robkit/x ships robkit's own test src/index.test.ts",
      "@robkit/x ships robkit's own test src/types.test-d.ts",
      "@robkit/x ships robkit's own test src/view.test.tsx",
      "@robkit/x ships robkit's own test src/test/fake-core.ts",
    ]);
  });

  it("lets a template keep its tests, which are an install's", () => {
    const files = [
      ...sound.files,
      "templates/stacks/start/src/home.test.tsx",
      "templates/stacks/go/server_test.go",
    ];

    expect(packProblems({ ...sound, files })).toEqual([]);
  });
});

describe("templateTestProblems", () => {
  it("names each template test the tarball lacks", () => {
    expect(
      templateTestProblems({ ...sound, name: "create-robkit" }, [
        "templates/stacks/start/src/home.test.tsx",
        "templates/stacks/go/server_test.go",
      ]),
    ).toEqual([
      "create-robkit lacks its template's test templates/stacks/start/src/home.test.tsx",
      "create-robkit lacks its template's test templates/stacks/go/server_test.go",
    ]);
  });
});

describe("every published package, packed", { timeout: 60_000 }, () => {
  // Packing takes about a second alone, and far longer beside the e2e suite.
  let packed: Packed[];
  beforeAll(async () => {
    packed = await Promise.all((await publishedPackages()).map(pack));
  }, 60_000);

  // Node won't strip types under node_modules, so an install that takes the
  // packages from npm or a tarball needs them as JS.
  it("points every export and bin at JS in the tarball", async () => {
    // Every package under packages/ is published, and packs.
    const folders = await readdir(join(root, "packages"));
    const names = await Promise.all(
      folders.map(
        async (folder) =>
          (
            await readJsonFile(
              join(root, "packages", folder, "package.json"),
              readNamedManifest,
            )
          ).name,
      ),
    );

    expect(names).toContain("@robkit/guard");
    expect(packed.map(({ name }) => name).sort()).toEqual(names.sort());
    expect(packed.flatMap(packProblems)).toEqual([]);
  });

  // An owner's tests import a /testing entry, which the rule that keeps
  // robkit's own tests out mustn't catch.
  it("ships each /testing entry", () => {
    const withTesting = packed.filter(({ dir }) =>
      existsSync(join(dir, "src/testing.ts")),
    );
    // Guard's build keeps src's folder, so its entry is dist/src/testing.js.
    const lacking = withTesting
      .filter(
        ({ files }) =>
          !files.some((file) => /^dist\/(src\/)?testing\.js$/.test(file)),
      )
      .map(({ name }) => name);

    expect(withTesting.map(({ name }) => name)).toContain("@robkit/guard");
    expect(lacking).toEqual([]);
  });

  it("keeps create-robkit's template tests, which are an install's", async () => {
    const createRobkit = packed.find(({ name }) => name === "create-robkit");
    const expected = await templateTests();

    expect(expected).toContain("templates/stacks/go/server_test.go");
    expect(
      createRobkit && templateTestProblems(createRobkit, expected),
    ).toEqual([]);
  });

  it("passes publint", async () => {
    expect((await Promise.all(packed.map(publintProblems))).flat()).toEqual([]);
  });

  it("passes Are the Types Wrong for ESM under Node and bundlers", async () => {
    expect((await Promise.all(packed.map(attwProblems))).flat()).toEqual([]);
  });
});
