// What a link to any built page shows: its title, its description and
// the one preview image, with its canonical address.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "./repo.ts";
import { previewImage } from "./site.ts";
import {
  addressOf,
  built,
  builtPages,
  isNoindex,
  origin,
} from "./test/built.ts";

/** A meta tag's content, by its `property` or `name`. */
const meta = (html: string, key: string) =>
  new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(
    html,
  )?.[1];

describe("a link to any built page", () => {
  it("shows its title, its description and the preview image", async () => {
    const pages = await builtPages();
    expect(pages.length).toBeGreaterThan(30);
    for (const page of pages) {
      const html = await built(page);
      const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];

      expect(title, page).toBeDefined();
      expect(meta(html, "og:title"), page).toBe(
        String(title).replace(/ \| robkit$/, ""),
      );
      expect(meta(html, "description"), page).not.toBe("");
      expect(meta(html, "og:description"), page).toBe(
        meta(html, "description"),
      );
      expect(meta(html, "og:image"), page).toBe(
        `${origin}${previewImage.path}`,
      );
      expect(meta(html, "twitter:card"), page).toBe("summary_large_image");
    }
  });

  it("names the page's own address as its canonical one, unless the page asks to be left out", async () => {
    for (const page of await builtPages()) {
      const html = await built(page);
      const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];

      if (isNoindex(html)) {
        expect(canonical, page).toBeUndefined();
      } else {
        expect(canonical, page).toBe(addressOf(page));
        expect(meta(html, "og:url"), page).toBe(canonical);
      }
    }
  });

  it("shows a preview image of the size each page gives", async () => {
    const png = await readFile(
      join(repoRoot, "site", "dist", previewImage.path),
    );

    // A PNG's header holds its width and height, after its 16 first bytes.
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      previewImage.width,
      previewImage.height,
    ]);
    expect(png.length).toBeLessThan(200 * 1024);
  });
});
