// The weight limit in DESIGN.md: what a docs page's scripts weigh as it
// opens, measured on the built page.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";
import { scriptBudget } from "./site.ts";

const dist = join(repoRoot, "site", "dist");

/**
 * The gzipped size of every script a built page fetches as it opens: each
 * inline script, each script file and each module it preloads, counted
 * once. Gzip runs on each alone, as a server sends them.
 */
async function openingScriptBytes(page: string): Promise<number> {
  const html = await readFile(join(dist, page), "utf8");
  const bodies: string[] = [];
  const files = new Set<string>();
  for (const [tag = "", body = ""] of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/g,
  )) {
    const src = /\bsrc="([^"]+)"/.exec(tag)?.[1];
    if (src === undefined) bodies.push(body);
    else files.add(src);
  }
  for (const [, href] of html.matchAll(
    /<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g,
  )) {
    if (href !== undefined) files.add(href);
  }
  for (const file of files) {
    expect(file, `${page} fetches a script from another origin`).toMatch(/^\//);
    bodies.push(await readFile(join(dist, file), "utf8"));
  }
  return bodies.reduce((sum, body) => sum + gzipSync(body).length, 0);
}

describe("a docs page's scripts", () => {
  // The samples page has one of every piece a docs page can use, so it
  // fetches every script one can.
  it.each(["docs/get-started/what-you-need/index.html", "samples/index.html"])(
    "weigh no more than the limit DESIGN.md records, on %s",
    async (page) => {
      const bytes = await openingScriptBytes(page);

      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThanOrEqual(scriptBudget);
    },
  );

  it("have the limit DESIGN.md says", async () => {
    const guide = await readFile(join(repoRoot, "site", "DESIGN.md"), "utf8");

    expect(guide).toContain(
      `come to at most ${String(scriptBudget / 1024)} KB gzipped`,
    );
  });
});
