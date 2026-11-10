import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readJsonFile, readNamedManifest } from "./manifest.ts";
import { publishedPackages } from "./published.ts";
import {
  fixedGroupProblems,
  majorChangesetProblems,
  publishPlan,
  releasePackages,
} from "./release.ts";

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

describe("publishPlan", () => {
  // Three packages at 0.2.0, as the fixed group releases them: input
  // underneath, guard on input, and create-robkit on both.
  const input = { name: "@robkit/input", version: "0.2.0", dependsOn: [] };
  const guard = {
    name: "@robkit/guard",
    version: "0.2.0",
    dependsOn: ["@robkit/input"],
  };
  const createRobkit = {
    name: "create-robkit",
    version: "0.2.0",
    dependsOn: ["@robkit/guard", "@robkit/input"],
  };
  const packages = [createRobkit, guard, input];

  it("publishes every package npm lacks, dependencies first, and tags nothing yet", () => {
    const published = new Map([
      ["@robkit/input", ["0.1.0"]],
      ["@robkit/guard", ["0.1.0"]],
      ["create-robkit", ["0.1.0"]],
    ]);

    expect(publishPlan(packages, published)).toEqual({
      publish: [input, guard, createRobkit],
      tag: undefined,
    });
  });

  it("publishes a package npm has never seen", () => {
    expect(publishPlan([input], new Map())).toEqual({
      publish: [input],
      tag: undefined,
    });
  });

  it("leaves out what a release that stopped halfway published, and waits to tag", () => {
    const halfway = new Map([
      ["@robkit/input", ["0.1.0", "0.2.0"]],
      ["@robkit/guard", ["0.1.0", "0.2.0"]],
      ["create-robkit", ["0.1.0"]],
    ]);

    expect(publishPlan(packages, halfway)).toEqual({
      publish: [createRobkit],
      tag: undefined,
    });
  });

  it("tags the version once the last package is on npm", () => {
    const all = new Map([
      ["@robkit/input", ["0.1.0", "0.2.0"]],
      ["@robkit/guard", ["0.1.0", "0.2.0"]],
      ["create-robkit", ["0.1.0", "0.2.0"]],
    ]);

    expect(publishPlan(packages, all)).toEqual({ publish: [], tag: "v0.2.0" });
  });

  it("refuses packages at different versions", () => {
    expect(() =>
      publishPlan([input, { ...guard, version: "0.1.1" }], new Map()),
    ).toThrow(
      "The packages aren't at one version (@robkit/input@0.2.0, @robkit/guard@0.1.1), so there is no one release to publish. Merge the version pull request that pnpm release:version opens.",
    );
  });
});

describe("releasePackages", () => {
  it("reads each published package's version and the packages it depends on", async () => {
    const packages = await releasePackages();
    const createRobkit = packages.find(({ name }) => name === "create-robkit");
    const names = await publishedNames();

    expect(packages.map(({ name }) => name).sort()).toEqual(names.sort());
    expect(createRobkit?.dependsOn).toContain("@robkit/input");
    expect(createRobkit?.dependsOn).not.toContain("prettier");
    expect(createRobkit?.dir).toBe(join(root, "packages", "create-robkit"));
    expect(new Set(packages.map(({ version }) => version)).size).toBe(1);
  });
});
