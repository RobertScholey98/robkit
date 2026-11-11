// The home page in Chromium, as a newcomer meets it: the sentence that says
// what robkit is above the fold, axe at both widths in both themes, and
// every link with scripts off.

import { AxeBuilder } from "@axe-core/playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPage, openSite, type Site } from "./test/browser.ts";

const sentence =
  "A kit for self-hosting small apps for your friends and family.";

let site: Site;

beforeAll(async () => {
  site = await openSite();
});

afterAll(async () => {
  await site.close();
});

describe.each([375, 1280] as const)("at %i pixels wide", (width) => {
  it("says what robkit is above the fold, with the way in under it", async () => {
    const { page } = await openPage(site, "/", { width });
    const fold = page.viewportSize()?.height ?? 0;
    const bottom = async (name: string, role: "heading" | "link") => {
      const box = await page
        .getByRole(role, { name, exact: true })
        .first()
        .boundingBox();
      return (box?.y ?? Infinity) + (box?.height ?? 0);
    };

    expect(fold).toBe(800);
    expect(await bottom(sentence, "heading")).toBeLessThanOrEqual(fold);
    expect(await bottom("Read the quickstart", "link")).toBeLessThanOrEqual(
      fold,
    );
  });

  it("draws the diagram's words 12 pixels tall at least", async () => {
    const { page } = await openPage(site, "/", { width });

    const sizes = await page.locator(".diagram svg").evaluate((svg) => {
      if (!(svg instanceof SVGSVGElement)) return [];
      const scale =
        svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      return [...svg.querySelectorAll("text")].map(
        (text) => Number.parseFloat(getComputedStyle(text).fontSize) * scale,
      );
    });

    expect(sizes.length).toBeGreaterThan(10);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it.each(["light", "dark"] as const)(
    "has nothing axe finds in the %s theme",
    async (theme) => {
      const { page } = await openPage(site, "/", { width, theme });
      const { violations } = await new AxeBuilder({ page }).analyze();

      expect(violations.map(({ id, nodes }) => [id, nodes.length])).toEqual([]);
    },
  );

  it("shows its text and every link with scripts off, and no copy button", async () => {
    const { page } = await openPage(site, "/", { width, scripts: false });
    const main = page.getByRole("main");

    await expect(
      page.getByRole("heading", { level: 1, name: sentence }).isVisible(),
    ).resolves.toBe(true);
    for (const link of await main.getByRole("link").all()) {
      expect(await link.isVisible(), await link.innerText()).toBe(true);
    }
    expect(await main.getByRole("link").count()).toBeGreaterThan(8);
    expect(
      await page.getByText("npm create robkit my-install").isVisible(),
    ).toBe(true);
    // Copying needs a script, so the button doesn't show without one.
    expect(await page.getByRole("button", { name: "Copy" }).count()).toBe(0);
  });
});
