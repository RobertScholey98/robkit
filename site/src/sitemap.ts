// Writes sitemap.xml once Astro has built the site, from the built pages,
// so a new page is in it with no other edit. robots.txt names it.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { filesIn } from "./dist.ts";

/**
 * Writes `sitemap.xml`: every page at `origin`, but one that asks search
 * engines to leave it out, such as the samples page and the 404, and a
 * stub.
 */
export async function writeSitemap(dist: string, origin: string) {
  const urls: string[] = [];
  for (const file of await filesIn(dist, "**/index.html")) {
    const html = await readFile(join(dist, file), "utf8");
    if (html.includes('<meta name="robots" content="noindex">')) continue;
    if (html.includes("data-stub")) continue;
    urls.push(`${origin}/${file.slice(0, -"index.html".length)}`);
  }
  await writeFile(
    join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .sort()
  .map((url) => `  <url><loc>${url}</loc></url>\n`)
  .join("")}</urlset>
`,
  );
}
