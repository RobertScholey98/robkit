// Writes the docs search's index, search.json, from the built docs pages
// once Astro has built the site. Reading the built pages indexes what a
// reader sees, built parts and template files included.

import { glob, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sectionsOf, type SearchIndex } from "./search.ts";

/** Writes `search.json` into `dist`, from every docs page but a stub. */
export async function writeSearchIndex(dist: string): Promise<void> {
  const files: string[] = [];
  for await (const file of glob("docs/**/index.html", { cwd: dist })) {
    files.push(file.replaceAll("\\", "/"));
  }
  const pages: SearchIndex["pages"] = [];
  for (const file of files.sort()) {
    const href = `/${file.slice(0, -"index.html".length)}`;
    const page = sectionsOf(await readFile(join(dist, file), "utf8"), href);
    if (page !== undefined) pages.push(page);
  }
  const index: SearchIndex = { pages };
  await writeFile(join(dist, "search.json"), JSON.stringify(index));
}
