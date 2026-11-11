// Every built page in Chromium, found from dist/ so a new page needs no
// edit here: axe at both widths in both themes, and nothing but a code
// block wider than a phone.

import { AxeBuilder } from "@axe-core/playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { builtPages } from "./test/built.ts";
import { openPage, openSite, type Site } from "./test/browser.ts";

let site: Site;

beforeAll(async () => {
  site = await openSite();
});

afterAll(async () => {
  await site.close();
});

/** Where each built page is served: `docs/a/index.html` is at `/docs/a/`. */
const paths = (await builtPages()).map(
  (page) => `/${page.replace(/index\.html$/, "")}`,
);

it("finds every page, the home page, the 404 and the docs among them", () => {
  expect(paths).toEqual(
    expect.arrayContaining(["/", "/404.html", "/docs/deploy/coolify/"]),
  );
});

describe.each(paths)("%s", (path) => {
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
