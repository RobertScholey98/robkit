import { beforeAll, describe, expect, it } from "vitest";
import {
  attwProblems,
  pack,
  packProblems,
  publishedPackages,
  publintProblems,
  type Packed,
} from "./published.ts";

describe("packProblems", () => {
  it("names a target that is TypeScript source, or missing", () => {
    expect(
      packProblems({
        name: "@robkit/x",
        targets: ["./src/index.ts", "./dist/index.d.ts", "./dist/gone.js"],
        files: ["package.json", "src/index.ts", "dist/index.d.ts"],
      }),
    ).toEqual([
      "@robkit/x points at TypeScript source: ./src/index.ts",
      "@robkit/x lacks ./dist/gone.js",
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
  it("points every export and bin at JS in the tarball", () => {
    expect(packed.map(({ name }) => name).sort()).toEqual([
      "@robkit/core",
      "@robkit/dev",
      "@robkit/guard",
      "@robkit/hono",
      "@robkit/react",
      "@robkit/session",
      "@robkit/start",
      "create-robkit",
    ]);
    expect(packed.flatMap(packProblems)).toEqual([]);
  });

  it("passes publint", async () => {
    expect((await Promise.all(packed.map(publintProblems))).flat()).toEqual([]);
  });

  it("passes Are the Types Wrong for ESM under Node and bundlers", async () => {
    expect((await Promise.all(packed.map(attwProblems))).flat()).toEqual([]);
  });
});
