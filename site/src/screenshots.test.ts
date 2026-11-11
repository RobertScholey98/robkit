import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";
import { screenshots, screenshotsDir } from "./screenshots.ts";

const dir = join(repoRoot, screenshotsDir);

describe("the screenshots", () => {
  it("are the pictures pnpm screenshots took, each with words for a reader who can't see it", async () => {
    const files = (await readdir(dir)).filter((file) => file.endsWith(".png"));

    expect(files.map((file) => file.slice(0, -".png".length)).sort()).toEqual(
      Object.keys(screenshots).sort(),
    );
    for (const { alt } of Object.values(screenshots)) {
      expect(alt.length).toBeGreaterThan(40);
    }
  });

  it("have a record of the commit and the command that took them", async () => {
    const record: unknown = JSON.parse(
      await readFile(join(dir, "record.json"), "utf8"),
    );
    const root: unknown = JSON.parse(
      await readFile(join(repoRoot, "package.json"), "utf8"),
    );

    // A whole commit, with no note that files had changed.
    expect(JSON.stringify(record)).toMatch(
      /^\{"commit":"[0-9a-f]{40}","command":"pnpm screenshots"\}$/,
    );
    expect(root).toHaveProperty(["scripts", "screenshots"]);
  });
});
