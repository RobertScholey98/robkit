import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readJsonFile, readNamedManifest } from "./manifest.ts";
import { publishedPackages } from "./published.ts";
import { fixedGroupProblems } from "./release.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** The name of every package robkit publishes, read from `packages/`. */
async function publishedNames(): Promise<string[]> {
  const dirs = await publishedPackages();
  const manifests = await Promise.all(
    dirs.map((dir) =>
      readJsonFile(join(dir, "package.json"), readNamedManifest),
    ),
  );
  return manifests.map(({ name }) => name);
}

describe("fixedGroupProblems", () => {
  const names = ["create-robkit", "@robkit/core", "@robkit/guard"];

  it("accepts one group that names or matches every published package", () => {
    expect(
      fixedGroupProblems({ fixed: [["create-robkit", "@robkit/*"]] }, names),
    ).toEqual([]);
    expect(
      fixedGroupProblems(
        { fixed: [["create-robkit", "@robkit/core", "@robkit/guard"]] },
        names,
      ),
    ).toEqual([]);
  });

  it("names each published package the group leaves out", () => {
    expect(
      fixedGroupProblems({ fixed: [["create-robkit", "@robkit/core"]] }, names),
    ).toEqual([
      "@robkit/guard isn't in .changeset/config.json's fixed group, so it could be released at a version the others aren't. Add it to the group, or match it with \"@robkit/*\".",
    ]);
  });

  it("refuses a config with no fixed group, or more than one", () => {
    const one =
      '.changeset/config.json needs one fixed group holding every published package, such as "fixed": [["create-robkit", "@robkit/*"]], so they are always released at one version.';

    expect(fixedGroupProblems({}, names)).toEqual([one]);
    expect(
      fixedGroupProblems(
        { fixed: [["create-robkit"], ["@robkit/core", "@robkit/guard"]] },
        names,
      ),
    ).toEqual([one]);
  });

  it("finds every package under packages/ in the repo's own group", async () => {
    const config: unknown = JSON.parse(
      await readFile(join(root, ".changeset/config.json"), "utf8"),
    );
    const names = await publishedNames();

    expect(names).toContain("@robkit/react");
    expect(names).toHaveLength((await readdir(join(root, "packages"))).length);
    expect(fixedGroupProblems(config, names)).toEqual([]);
  });
});
