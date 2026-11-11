// The samples page in Chromium: each piece a docs page uses to show code,
// as a reader meets it.

import { AxeBuilder } from "@axe-core/playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPage, openSite, type Site } from "./test/browser.ts";

const path = "/samples/";

let site: Site;

beforeAll(async () => {
  site = await openSite();
});

afterAll(async () => {
  await site.close();
});

describe.each([375, 1280] as const)("at %i pixels wide", (width) => {
  it.each(["light", "dark"] as const)(
    "has coloured code axe finds nothing wrong with in the %s theme",
    async (theme) => {
      const { page } = await openPage(site, path, { width, theme });
      const { violations } = await new AxeBuilder({ page }).analyze();
      const keyword = page
        .locator("pre.astro-code span")
        .filter({ hasText: /^import$/ })
        .first();

      expect(violations.map(({ id, nodes }) => [id, nodes.length])).toEqual([]);
      expect(
        await keyword.evaluate((span) => getComputedStyle(span).color),
      ).toBe(theme === "dark" ? "rgb(253, 164, 175)" : "rgb(159, 18, 57)");
    },
  );
});
