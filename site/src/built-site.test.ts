// Reads the site as Astro built it. Turbo runs the site's build before its
// tests, so dist is fresh.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { quickstartCommands } from "./readme.ts";
import { repoRoot } from "./repo.ts";

const built = (path: string) =>
  readFile(join(repoRoot, "site", "dist", path), "utf8");

describe("the built home page", () => {
  it("shows the three commands from the README's quickstart", async () => {
    const readme = await readFile(join(repoRoot, "README.md"), "utf8");
    const commands = quickstartCommands(readme, "README.md");
    const html = await built("index.html");

    expect(commands).toHaveLength(3);
    for (const command of commands) expect(html).toContain(command);
  });
});
