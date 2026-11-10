import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readJsonFile, readNamedManifest } from "./manifest.ts";
import { publishedPackages } from "./published.ts";
import { fixedGroupProblems, majorChangesetProblems } from "./release.ts";

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

describe("majorChangesetProblems", () => {
  const changeset = (releases: string) =>
    `---\n${releases}\n---\n\nWhat changed.\n`;

  it("accepts minor and patch changesets before 1.0.0", () => {
    expect(
      majorChangesetProblems(
        [
          { id: "a", text: changeset('"@robkit/core": minor') },
          {
            id: "b",
            text: changeset('create-robkit: patch\n"@robkit/guard": minor'),
          },
        ],
        "0.1.0",
      ),
    ).toEqual([]);
  });

  it("names a major changeset while the version is under 1.0.0", () => {
    expect(
      majorChangesetProblems(
        [{ id: "big", text: changeset('"@robkit/core": major') }],
        "0.4.2",
      ),
    ).toEqual([
      ".changeset/big.md makes a major change to @robkit/core while robkit is at 0.4.2, which would release 1.0.0. Make it minor: before 1.0.0, a minor release is the one that may break an install.",
    ]);
  });

  it("allows a major changeset from 1.0.0 on", () => {
    expect(
      majorChangesetProblems(
        [{ id: "big", text: changeset('"@robkit/core": major') }],
        "1.0.0",
      ),
    ).toEqual([]);
  });

  it("finds no major changeset waiting in the repo", async () => {
    const dir = join(root, ".changeset");
    const files = (await readdir(dir)).filter(
      (file) => file.endsWith(".md") && file !== "README.md",
    );
    const changesets = await Promise.all(
      files.map(async (file) => ({
        id: file.replace(/\.md$/, ""),
        text: await readFile(join(dir, file), "utf8"),
      })),
    );
    const { version } = await readJsonFile(
      join(root, "packages/create-robkit/package.json"),
      readNamedManifest,
    );

    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(majorChangesetProblems(changesets, version ?? "")).toEqual([]);
  });
});
