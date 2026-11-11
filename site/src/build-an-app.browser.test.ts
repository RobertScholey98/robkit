// The Build an app pages in Chromium: axe at both widths in both themes,
// with the stack switchers on them, and nothing but a code block wider
// than a phone.

import { AxeBuilder } from "@axe-core/playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPage, openSite, type Site } from "./test/browser.ts";

let site: Site;

beforeAll(async () => {
  site = await openSite();
});

afterAll(async () => {
  await site.close();
});

describe.each([
  "/docs/build-an-app/tanstack-start/",
  "/docs/build-an-app/react-hono/",
  "/docs/build-an-app/react-express/",
  "/docs/build-an-app/nextjs/",
  "/docs/build-an-app/react-go/",
  "/docs/build-an-app/the-viewer-and-the-guard/",
  "/docs/build-an-app/testing-with-a-viewer/",
  "/docs/build-an-app/the-database/",
  "/docs/build-an-app/settings/",
  "/docs/build-an-app/the-layer-rule/",
])("%s", (path) => {
  describe.each([375, 1280] as const)("at %i pixels wide", (width) => {
    it.each(["light", "dark"] as const)(
      "has nothing axe finds in the %s theme",
      async (theme) => {
        const { page } = await openPage(site, path, { width, theme });
        const { violations } = await new AxeBuilder({ page }).analyze();

        expect(violations.map(({ id, nodes }) => [id, nodes.length])).toEqual(
          [],
        );
      },
    );
  });

  it("scrolls sideways at 375 pixels only inside a code block", async () => {
    const { page } = await openPage(site, path, {
      width: 375,
      theme: "light",
    });

    const pageWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );

    expect(pageWidth).toBe(375);
  });
});
