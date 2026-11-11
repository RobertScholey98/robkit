// Makes public/preview.png, the image every page's link preview shows,
// from preview-image.html in Chromium. Run it with `pnpm preview-image`
// after changing the HTML, the style guide's dark theme or the fonts.

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { previewImage } from "../src/site.ts";

const source = new URL("preview-image.html", import.meta.url);
const out = fileURLToPath(
  new URL(`../public${previewImage.path}`, import.meta.url),
);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: previewImage.width, height: previewImage.height },
    deviceScaleFactor: 1,
  });
  await page.goto(source.href);
  await page.evaluate(() => document.fonts.ready);
  await mkdir(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
}
