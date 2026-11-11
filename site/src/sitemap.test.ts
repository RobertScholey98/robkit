import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPages } from "./pages.ts";
import { writeSitemap } from "./sitemap.ts";
import {
  addressOf,
  built,
  builtPages,
  isNoindex,
  origin,
} from "./test/built.ts";

async function site(files: Record<string, string>): Promise<string> {
  const dist = await mkdtemp(join(tmpdir(), "sitemap-"));
  for (const [path, html] of Object.entries(files)) {
    await mkdir(join(dist, path, ".."), { recursive: true });
    await writeFile(join(dist, path), html);
  }
  return dist;
}

const noindex = '<meta name="robots" content="noindex">';

describe("writeSitemap", () => {
  it("lists every page but a noindex page and a stub, by address", async () => {
    const dist = await site({
      "index.html": "<h1>robkit</h1>",
      "404.html": `${noindex}<h1>Not here</h1>`,
      "samples/index.html": `${noindex}<h1>Samples</h1>`,
      "docs/get-started/quickstart/index.html": "<p>Run it.</p>",
      "docs/reference/settings/index.html":
        '<p class="stub" data-stub>Not yet.</p>',
    });

    await writeSitemap(dist, "https://robkit.dev");

    expect(await readFile(join(dist, "sitemap.xml"), "utf8")).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://robkit.dev/</loc></url>
  <url><loc>https://robkit.dev/docs/get-started/quickstart/</loc></url>
</urlset>
`,
    );
  });
});

describe("the built site's sitemap", () => {
  it("lists every page but the 404, the samples page and stubs", async () => {
    const sitemap = await built("sitemap.xml");
    const listed = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(
      ([, url]) => String(url),
    );
    const stubs = (await readPages())
      .filter(({ stub }) => stub)
      .map(({ id }) => id);
    const expected: string[] = [];
    for (const page of await builtPages()) {
      if (!page.endsWith("index.html")) continue;
      const html = await built(page);
      if (isNoindex(html) || html.includes("data-stub")) continue;
      expected.push(addressOf(page));
    }

    expect(listed).toEqual(expected.sort());
    expect(listed).toContain(`${origin}/`);
    expect(listed).toContain(`${origin}/docs/get-started/quickstart/`);
    for (const left of ["404", "samples/", ...stubs]) {
      expect(
        listed.some((url) => url.includes(left)),
        left,
      ).toBe(false);
    }
  });

  it("is the one robots.txt names", async () => {
    expect(await built("robots.txt")).toBe(
      `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`,
    );
  });
});
