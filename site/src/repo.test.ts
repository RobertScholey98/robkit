import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findRepoRoot, readRepoFile, repoRoot } from "./repo.ts";

describe("findRepoRoot", () => {
  it("finds the folder that holds pnpm-workspace.yaml, from below it", () => {
    expect(findRepoRoot(join(repoRoot, "site", "src"))).toBe(repoRoot);
    expect(existsSync(join(repoRoot, "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(join(repoRoot, "site", "package.json"))).toBe(true);
  });

  it("says where it looked when no folder above holds one", () => {
    const outside = tmpdir();

    expect(() => findRepoRoot(outside)).toThrow(
      `No folder from ${outside} up holds pnpm-workspace.yaml. Build the site from inside the robkit repo.`,
    );
  });
});

describe("readRepoFile", () => {
  it("reads a file by its path from the repo's root", async () => {
    expect(await readRepoFile("pnpm-workspace.yaml")).toContain("packages:");
  });
});
