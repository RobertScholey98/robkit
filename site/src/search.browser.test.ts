// Search in Chromium: what it fetches before and after it opens, what it
// finds, the keyboard, and axe on the open dialog. Then the 404 page.

import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openPage, openSite, type Site } from "./test/browser.ts";

let site: Site;

beforeAll(async () => {
  site = await openSite();
});

afterAll(async () => {
  await site.close();
});

const page = "/docs/get-started/quickstart/";

const searchFetches = (requests: string[]) =>
  requests.filter(
    (url) => url.endsWith("/search.json") || url.includes("search-dialog"),
  );

/** The first result's link, once results show. */
const firstResult = (opened: Page) =>
  opened.locator("#search-results a").first();

const focused = (opened: Page) =>
  opened.evaluate(() => {
    const element = document.activeElement;
    if (element === null) return undefined;
    if (element.id !== "") return element.id;
    return element.getAttribute("href") ?? element.tagName;
  });

/** Presses / and waits for the search box to have focus. */
async function slash(opened: Page): Promise<void> {
  await opened.keyboard.press("/");
  await expect.poll(() => focused(opened)).toBe("search-input");
}

/** The header's search button. */
const searchButton = (opened: Page) =>
  opened.getByRole("button", { name: "Search", exact: true });

describe("search", () => {
  it("fetches no search code and no index until it opens", async () => {
    const { page: opened, requests } = await openPage(site, page, {
      width: 1280,
    });

    expect(searchFetches(requests)).toEqual([]);

    await slash(opened);
    await opened.locator("#search-input").fill("robkit add");
    await firstResult(opened).waitFor();

    expect(searchFetches(requests)).toHaveLength(2);
  });

  it.each([
    ["robkit add", "/docs/reference/robkit-command/#robkit-add"],
    ["ROBKIT_DOMAIN", "/docs/reference/settings/#robkit_domain"],
    ["neighbours", "/docs/concepts/security/"],
  ])("finds %s on the right page", async (query, href) => {
    const { page: opened } = await openPage(site, page, { width: 1280 });

    await slash(opened);
    await opened.locator("#search-input").fill(query);

    expect(await firstResult(opened).getAttribute("href")).toContain(href);
  });

  it("says so for an empty box, and for a search that finds nothing", async () => {
    const { page: opened } = await openPage(site, page, { width: 1280 });
    const status = opened.locator("#search-status");

    await searchButton(opened).click();
    await expect.poll(() => status.textContent()).toContain("Type a command");

    await opened.locator("#search-input").fill("zzzzqqq");

    await expect
      .poll(() => status.textContent())
      .toContain("Nothing in the docs matches “zzzzqqq”");
    expect(await opened.locator("#search-results a").count()).toBe(0);
  });

  it("moves through results from the keyboard, opens one with Enter, and gives focus back on Escape", async () => {
    const { page: opened } = await openPage(site, page, { width: 1280 });
    const link = opened.locator("#main a").first();
    await link.focus();
    const before = await focused(opened);

    await slash(opened);
    await opened.keyboard.type("robkit");
    await firstResult(opened).waitFor();
    const hrefs = await opened
      .locator("#search-results a")
      .evaluateAll((links) => links.map((each) => each.getAttribute("href")));

    await opened.keyboard.press("ArrowDown");
    expect(await focused(opened)).toBe(hrefs[0]);
    await opened.keyboard.press("ArrowDown");
    expect(await focused(opened)).toBe(hrefs[1]);
    await opened.keyboard.press("ArrowUp");
    await opened.keyboard.press("ArrowUp");
    expect(await focused(opened)).toBe("search-input");

    await opened.keyboard.press("Escape");
    expect(await opened.locator("dialog#search").isVisible()).toBe(false);
    expect(await focused(opened)).toBe(before);

    await slash(opened);
    await opened.keyboard.type("ROBKIT_DOMAIN");
    await firstResult(opened).waitFor();
    await opened.keyboard.press("Enter");
    await opened.waitForURL(/\/docs\/reference\/settings\/#robkit_domain$/);
  });

  it("gives focus back to the button that opened it", async () => {
    const { page: opened } = await openPage(site, page, { width: 375 });
    const button = searchButton(opened);

    await button.click();
    await opened.locator("[data-search-close]").click();

    expect(
      await button.evaluate((each) => each === document.activeElement),
    ).toBe(true);
  });

  it("fits the header's controls inside the page at 375 pixels wide", async () => {
    const { page: opened } = await openPage(site, page, { width: 375 });

    const edges = await opened
      .locator(".header button:visible, .header a:visible")
      .evaluateAll((controls) =>
        controls.map((each) => Math.round(each.getBoundingClientRect().right)),
      );

    expect(edges.length).toBeGreaterThanOrEqual(6);
    expect(Math.max(...edges)).toBeLessThanOrEqual(375 - 16);
  });

  it("shows one way to close, not the browser's clear button too", async () => {
    const { page: opened } = await openPage(site, page, { width: 375 });

    const input = opened.locator("#search-input");
    await searchButton(opened).click();
    await input.fill("robkit");
    const asSearch = await input.screenshot();

    // A text field draws no clear button, so the two match without one.
    await input.evaluate((field) => {
      field.setAttribute("type", "text");
    });

    expect((await input.screenshot()).equals(asSearch)).toBe(true);
  });

  it("types a slash into a field", async () => {
    const { page: opened } = await openPage(site, page, { width: 1280 });
    await opened.evaluate(() => {
      const field = document.createElement("input");
      field.id = "a-field";
      field.setAttribute("aria-label", "A field");
      document.querySelector("#main")?.prepend(field);
    });

    await opened.locator("#a-field").focus();
    await opened.keyboard.type("a/b");

    expect(await opened.locator("#a-field").inputValue()).toBe("a/b");
    expect(await opened.locator("dialog#search").isVisible()).toBe(false);

    await opened.keyboard.press("Escape");
    await opened.locator("#a-field").blur();
    await slash(opened);
    await opened.keyboard.type("x/y");

    expect(await opened.locator("#search-input").inputValue()).toBe("x/y");
  });

  describe.each([375, 1280] as const)("at %i pixels wide", (width) => {
    it.each(["light", "dark"] as const)(
      "has nothing axe finds when open, in the %s theme",
      async (theme) => {
        const { page: opened } = await openPage(site, page, { width, theme });

        await searchButton(opened).click();
        await opened.locator("#search-input").fill("robkit");
        await firstResult(opened).waitFor();
        const { violations } = await new AxeBuilder({ page: opened }).analyze();

        expect(violations.map(({ id, nodes }) => [id, nodes.length])).toEqual(
          [],
        );
      },
    );
  });
});

describe("the 404 page", () => {
  const missing = "/docs/one/two/three/not-a-page/";

  it("answers a path that doesn't exist, with search and a link home", async () => {
    const { page: opened } = await openPage(site, "/", { width: 375 });
    const response = await opened.goto(`${site.origin}${missing}`);

    expect(response?.status()).toBe(404);
    expect(await opened.locator("h1").textContent()).toBe(
      "This page isn't here",
    );
    expect(
      await opened
        .getByRole("link", { name: "Go to the home page" })
        .getAttribute("href"),
    ).toBe("/");

    await opened.getByRole("button", { name: "Search the docs" }).click();
    await opened.locator("#search-input").fill("robkit add");

    expect(await firstResult(opened).getAttribute("href")).toContain(
      "/docs/reference/robkit-command/",
    );
  });

  it.each(["light", "dark"] as const)(
    "has nothing axe finds, in the %s theme",
    async (theme) => {
      const { page: opened } = await openPage(site, missing, {
        width: 1280,
        theme,
      });
      const { violations } = await new AxeBuilder({ page: opened }).analyze();

      expect(violations.map(({ id, nodes }) => [id, nodes.length])).toEqual([]);
    },
  );
});
