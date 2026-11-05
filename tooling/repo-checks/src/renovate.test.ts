import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { readRepoPins, renovateProblems, type RepoPins } from "./renovate.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

const pins: RepoPins = { releaseAgeMinutes: 1440, typescript: "6.0.3" };
const keeping = {
  minimumReleaseAge: "1 day",
  packageRules: [
    { matchPackageNames: ["typescript"], allowedVersions: "<6.1.0" },
  ],
};

describe("renovateProblems", () => {
  it("accepts a config that waits as long as pnpm and keeps TypeScript on its minor", () => {
    expect(renovateProblems(keeping, pins)).toEqual([]);
    expect(
      renovateProblems({ ...keeping, minimumReleaseAge: "3 days" }, pins),
    ).toEqual([]);
  });

  it("rejects a release age shorter than pnpm's, or none", () => {
    expect(
      renovateProblems({ ...keeping, minimumReleaseAge: "12 hours" }, pins),
    ).toEqual([
      'renovate.json\'s minimumReleaseAge is "12 hours", shorter than pnpm\'s 1440 minutes, so Renovate would propose versions pnpm install refuses. Set it to "1 day" or longer.',
    ]);
    expect(
      renovateProblems({ packageRules: keeping.packageRules }, pins),
    ).toEqual([
      'renovate.json has no minimumReleaseAge, so Renovate would propose versions pnpm install refuses. Set it to "1 day" or longer.',
    ]);
  });

  it("rejects a config that lets TypeScript past its minor", () => {
    const message =
      'renovate.json lets typescript past 6.0, which typescript-eslint doesn\'t support yet. Add a package rule for typescript with allowedVersions "<6.1.0".';

    expect(renovateProblems({ ...keeping, packageRules: [] }, pins)).toEqual([
      message,
    ]);
    expect(
      renovateProblems(
        {
          ...keeping,
          packageRules: [
            { matchPackageNames: ["typescript"], allowedVersions: "<7.0.0" },
          ],
        },
        pins,
      ),
    ).toEqual([message]);
  });

  it("names what it can't read", () => {
    expect(renovateProblems([], pins)).toEqual([
      "renovate.json must be a JSON object.",
    ]);
  });
});

describe("readRepoPins", () => {
  it("reads the release age and TypeScript pin, with pnpm's default age", () => {
    expect(
      readRepoPins({ catalog: { typescript: "6.0.3" }, minimumReleaseAge: 60 }),
    ).toEqual({ releaseAgeMinutes: 60, typescript: "6.0.3" });
    expect(readRepoPins({ catalog: { typescript: "6.0.3" } })).toEqual(pins);
  });

  it("names what it can't read", () => {
    expect(readRepoPins({ catalog: {} })).toBe(
      "pnpm-workspace.yaml's catalog must pin typescript.",
    );
    expect(
      readRepoPins({
        catalog: { typescript: "6.0.3" },
        minimumReleaseAge: "1d",
      }),
    ).toBe(
      "pnpm-workspace.yaml's minimumReleaseAge must be a number of minutes.",
    );
  });
});

describe("the robkit repo", () => {
  it("has a Renovate config that keeps to pnpm's release age and the TypeScript pin", async () => {
    const config: unknown = JSON.parse(
      await readFile(join(root, "renovate.json"), "utf8"),
    );
    const workspace: unknown = parse(
      await readFile(join(root, "pnpm-workspace.yaml"), "utf8"),
    );

    const repoPins = readRepoPins(workspace);
    if (typeof repoPins === "string") throw new Error(repoPins);

    expect(renovateProblems(config, repoPins)).toEqual([]);
  });
});
