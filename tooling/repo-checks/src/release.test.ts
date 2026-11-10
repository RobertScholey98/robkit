import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isRecord } from "@robkit/input";
import { describe, expect, it } from "vitest";
import { readJsonFile, readNamedManifest } from "./manifest.ts";
import { pack, publishedPackages } from "./published.ts";
import {
  dryRunProblems,
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

describe("dryRunProblems", () => {
  /** What create-robkit carries: each package's version, as its build writes it. */
  const carried = (versions: Record<string, string>) =>
    JSON.stringify({
      packages: Object.fromEntries(
        Object.entries(versions).map(([name, version]) => [
          name,
          { version, dependencies: [] },
        ]),
      ),
    });
  const guard = {
    name: "@robkit/guard",
    version: "0.1.0",
    specifiers: [
      { field: "dependencies", name: "@robkit/input", range: "0.1.0" },
    ],
    carried: undefined,
  };
  const createRobkit = {
    name: "create-robkit",
    version: "0.1.0",
    specifiers: [{ field: "dependencies", name: "yaml", range: "2.9.0" }],
    carried: carried({ "@robkit/guard": "0.1.0", "create-robkit": "0.1.0" }),
  };

  it("finds nothing wrong with packages at one version that carry it", () => {
    expect(dryRunProblems([guard, createRobkit])).toEqual([]);
  });

  it("names the versions when two packages differ", () => {
    expect(
      dryRunProblems([
        { ...guard, version: "0.1.1" },
        {
          ...createRobkit,
          carried: carried({
            "@robkit/guard": "0.1.1",
            "create-robkit": "0.1.0",
          }),
        },
      ]),
    ).toEqual([
      "The packages aren't at one version: @robkit/guard@0.1.1, create-robkit@0.1.0. Every package is in .changeset/config.json's fixed group, so set them back to one version with pnpm release:version.",
    ]);
  });

  it("names a packed manifest that still says workspace: or catalog:", () => {
    expect(
      dryRunProblems([
        {
          ...guard,
          specifiers: [
            {
              field: "dependencies",
              name: "@robkit/input",
              range: "workspace:*",
            },
            { field: "peerDependencies", name: "hono", range: "catalog:" },
          ],
        },
        createRobkit,
      ]),
    ).toEqual([
      "@robkit/guard's packed package.json still says workspace:* for @robkit/input in dependencies. Pack and publish with pnpm, which turns workspace: and catalog: into versions.",
      "@robkit/guard's packed package.json still says catalog: for hono in peerDependencies. Pack and publish with pnpm, which turns workspace: and catalog: into versions.",
    ]);
  });

  it("names a version create-robkit carries that isn't the one packed", () => {
    expect(
      dryRunProblems([
        guard,
        {
          ...createRobkit,
          carried: carried({
            "@robkit/guard": "0.0.0",
            "create-robkit": "0.1.0",
          }),
        },
      ]),
    ).toEqual([
      "create-robkit carries @robkit/guard@0.0.0, but @robkit/guard packs at 0.1.0. Build create-robkit again: its build writes dist/carried.json.",
    ]);
  });

  it("names a package create-robkit doesn't carry, or carries but nothing packs", () => {
    expect(
      dryRunProblems([
        guard,
        {
          ...createRobkit,
          carried: carried({
            "create-robkit": "0.1.0",
            "@robkit/gone": "0.1.0",
          }),
        },
      ]),
    ).toEqual([
      "create-robkit doesn't carry @robkit/guard, so an install can't name its version. Build create-robkit again: its build writes dist/carried.json.",
      "create-robkit carries @robkit/gone, which no package packs.",
    ]);
  });

  it("names a create-robkit tarball without what it carries", () => {
    expect(
      dryRunProblems([guard, { ...createRobkit, carried: undefined }]),
    ).toEqual([
      "create-robkit's tarball lacks dist/carried.json, so an install made from it reads no versions. Build create-robkit before packing it.",
    ]);
  });
});

describe("create-robkit's tarball", () => {
  // changeset version writes the changelog only at a release, so this packs
  // a stand-in with create-robkit's own `files` and a changelog.
  it("holds the CHANGELOG.md that robkit upgrade reads", async () => {
    const real: unknown = JSON.parse(
      await readFile(join(root, "packages/create-robkit/package.json"), "utf8"),
    );
    const dir = await mkdtemp(join(tmpdir(), "robkit-changelog-"));
    try {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "create-robkit",
          version: "0.1.0",
          files: isRecord(real) ? real.files : undefined,
        }),
      );
      await writeFile(join(dir, "CHANGELOG.md"), "# create-robkit\n");

      expect((await pack(dir)).files).toContain("CHANGELOG.md");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
