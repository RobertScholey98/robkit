// Writes each docs page's Markdown copy once Astro has built the site,
// from the built page, so it holds what a reader sees. See markdown.ts.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { filesIn } from "./dist.ts";
import { markdownOf } from "./markdown.ts";

/**
 * Where a page's Markdown copy is: its address with `.md` in place of its
 * trailing slash, so `/docs/a/` has its copy at `/docs/a.md`.
 */
export const markdownHref = (href: string) => href.replace(/\/$/, ".md");

/** Writes each docs page's Markdown copy at its `markdownHref`. */
export async function writeMarkdownCopies(dist: string): Promise<void> {
  for (const file of await filesIn(dist, "docs/**/index.html")) {
    const href = `/${file.slice(0, -"index.html".length)}`;
    const markdown = markdownOf(await readFile(join(dist, file), "utf8"), href);
    if (markdown === undefined) continue;
    await writeFile(join(dist, markdownHref(href)), markdown);
  }
}
