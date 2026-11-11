// Every built page in Chromium, found from dist/ so a new page needs no
// edit here: axe at both widths in both themes, and nothing but a code
// block wider than the screen at either width.

import { AxeBuilder } from "@axe-core/playwright";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
} from "vitest";
import { built, builtPages } from "./test/built.ts";
import { openPage, openSite, type Site } from "./test/browser.ts";

let site: Site;

beforeAll(async () => {
  site = await openSite();
});

afterAll(async () => {
  await site.close();
});

/**
 * Each built page: where it is served, as `docs/a/index.html` is at
 * `/docs/a/`, and where it sends the reader at once, for a docs folder's
 * page.
 */
const pages = await Promise.all(
  (await builtPages()).map(async (page) => ({
    path: `/${page.replace(/index\.html$/, "")}`,
    leadsTo: /<meta http-equiv="refresh" content="0; url=([^"]+)">/.exec(
      await built(page),
    )?.[1],
  })),
);
const paths = pages.map(({ path }) => path);

it("finds every page, the home page, the 404, the docs and their folders among them", () => {
  expect(paths).toEqual(
    expect.arrayContaining([
      "/",
      "/404.html",
      "/docs/deploy/coolify/",
      "/docs/",
      "/docs/deploy/",
    ]),
  );
});

describe.each(pages)("$path", ({ path, leadsTo }) => {
  // A docs folder's page would leave before it could be checked, so the
  // page it leads to answers 204 and the browser stays on it.
  describe.each([375, 1280] as const)("at %i pixels wide", (width) => {
    it.each(["light", "dark"] as const)(
      "has nothing axe finds in the %s theme",
      async (theme) => {
        const { page } = await openPage(site, path, {
          width,
          theme,
          stay: leadsTo,
        });
        const { violations } = await new AxeBuilder({ page }).analyze();

        expect(violations.map(({ id, nodes }) => [id, nodes.length])).toEqual(
          [],
        );
      },
    );
  });

  it.each([375, 1280] as const)(
    "scrolls sideways at %i pixels only inside a code block",
    async (width) => {
      const { page } = await openPage(site, path, {
        width,
        theme: "light",
        stay: leadsTo,
      });

      const pageWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );

      expect(pageWidth).toBe(width);
    },
  );

  if (leadsTo !== undefined) {
    it(`sends the reader on to ${leadsTo}, with scripts off`, async () => {
      // Not openPage, which waits on the first page's fonts as it leaves.
      const context = await site.browser.newContext({
        javaScriptEnabled: false,
      });
      onTestFinished(() => context.close());
      const page = await context.newPage();

      await page.goto(`${site.origin}${path}`);
      await page.waitForURL(`${site.origin}${leadsTo}`);
      expect(await page.locator("h1").count()).toBe(1);
    });
  }
});
