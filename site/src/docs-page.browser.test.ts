// A docs page in Chromium, as a reader meets it: axe at both widths in both
// themes, the theme toggle and the phone menu from the keyboard, no
// scripts, reduced motion, and no request to another origin.

import { AxeBuilder } from "@axe-core/playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { background, openPage, openSite, type Site } from "./test/browser.ts";

const path = "/docs/get-started/what-you-need/";
// tokens.css's --color-bg in each theme, as the browser writes it.
const lightBg = "rgb(255, 255, 255)";
const darkBg = "rgb(11, 17, 32)";

let site: Site;

beforeAll(async () => {
  site = await openSite();
});

afterAll(async () => {
  await site.close();
});

describe.each([375, 1280] as const)("at %i pixels wide", (width) => {
  it.each(["light", "dark"] as const)(
    "has nothing axe finds in the %s theme",
    async (theme) => {
      const { page } = await openPage(site, path, { width, theme });
      const { violations } = await new AxeBuilder({ page }).analyze();

      expect(violations.map(({ id, nodes }) => [id, nodes.length])).toEqual([]);
      expect(await background(page)).toBe(theme === "dark" ? darkBg : lightBg);
    },
  );

  it("shows its text and every link with scripts off", async () => {
    const { page } = await openPage(site, path, { width, scripts: false });

    await expect(
      page
        .getByRole("heading", { level: 1, name: "What you need" })
        .isVisible(),
    ).resolves.toBe(true);
    await expect(
      page
        .getByRole("navigation", { name: "Docs" })
        .getByRole("link", { name: "What you need" })
        .isVisible(),
    ).resolves.toBe(true);
    await expect(
      page.getByRole("link", { name: "nodejs.org" }).isVisible(),
    ).resolves.toBe(true);
    // Neither works without scripts, so neither shows.
    expect(await page.locator("[data-theme-toggle]").isVisible()).toBe(false);
    expect(await page.locator("[data-menu-button]").isVisible()).toBe(false);
  });

  it("asks for nothing from another origin", async () => {
    const { page, requests } = await openPage(site, path, { width });
    await page.getByRole("button", { name: "Dark theme" }).click();
    if (width === 375) await page.getByRole("button", { name: "Menu" }).click();

    expect(requests.length).toBeGreaterThan(1);
    expect(requests.filter((url) => !url.startsWith(site.origin))).toEqual([]);
  });

  it("shows focus on every control a keyboard reaches", async () => {
    const { page } = await openPage(site, path, { width });
    const unmarked: string[] = [];
    let reached = 0;
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (element === null || element === document.body) return null;
        const style = getComputedStyle(element);
        return {
          name: `${element.tagName} ${element.textContent.trim()}`,
          ring:
            element.matches(":focus-visible") &&
            style.outlineStyle !== "none" &&
            Number.parseFloat(style.outlineWidth) >= 2,
        };
      });
      if (focus === null) break;
      reached++;
      if (!focus.ring) unmarked.push(focus.name);
    }

    expect(reached).toBeGreaterThan(5);
    expect(unmarked).toEqual([]);
  });
});

describe("the theme", () => {
  it("follows the system with no script at all", async () => {
    const { page } = await openPage(site, path, {
      width: 1280,
      theme: "dark",
      scripts: false,
    });

    expect(await background(page)).toBe(darkBg);
  });

  it("takes a stored choice before the body paints", async () => {
    const context = await site.browser.newContext({ colorScheme: "light" });
    await context.addInitScript(() => {
      localStorage.setItem("robkit-theme", "dark");
      const seen = new MutationObserver(() => {
        // The DOM's types say body is always there. Before the parser
        // reaches it, it isn't.
        const body = document.body as HTMLElement | null;
        if (body !== null) {
          seen.disconnect();
          document.documentElement.dataset.atFirstPaint =
            document.documentElement.dataset.theme ?? "none";
        }
      });
      seen.observe(document, { childList: true, subtree: true });
    });
    const page = await context.newPage();
    await page.goto(`${site.origin}${path}`);

    expect(
      await page.evaluate(() => document.documentElement.dataset.atFirstPaint),
    ).toBe("dark");
    expect(await background(page)).toBe(darkBg);
    await context.close();
  });

  it("switches from the keyboard, and the choice survives a reload", async () => {
    const { page } = await openPage(site, path, { width: 1280 });
    const toggle = page.getByRole("button", { name: "Dark theme" });
    expect(await toggle.getAttribute("aria-pressed")).toBe("false");

    await toggle.focus();
    await page.keyboard.press("Enter");
    expect(await toggle.getAttribute("aria-pressed")).toBe("true");
    expect(await background(page)).toBe(darkBg);

    await page.reload();
    expect(
      await page
        .getByRole("button", { name: "Dark theme" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(await background(page)).toBe(darkBg);

    await page.getByRole("button", { name: "Dark theme" }).focus();
    await page.keyboard.press("Space");
    expect(await background(page)).toBe(lightBg);
  });
});

describe("the phone menu", () => {
  it("opens from the keyboard, and Escape closes it and gives focus back", async () => {
    const { page } = await openPage(site, path, { width: 375 });
    const button = page.getByRole("button", { name: "Menu" });
    const nav = page.getByRole("navigation", { name: "Docs" });
    expect(await nav.isVisible()).toBe(false);

    await button.focus();
    await page.keyboard.press("Enter");
    expect(await button.getAttribute("aria-expanded")).toBe("true");
    await nav.waitFor({ state: "visible" });
    expect(
      await page.evaluate(() => document.activeElement?.textContent.trim()),
    ).toBe("What you need");
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map(({ id }) => id)).toEqual([]);

    await page.keyboard.press("Escape");
    expect(await button.getAttribute("aria-expanded")).toBe("false");
    await nav.waitFor({ state: "hidden" });
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute("aria-controls") ?? "",
      ),
    ).toBe("site-nav");
  });

  it("is a column at 1280 pixels, with no button", async () => {
    const { page } = await openPage(site, path, { width: 1280 });

    expect(
      await page.getByRole("navigation", { name: "Docs" }).isVisible(),
    ).toBe(true);
    expect(await page.locator("[data-menu-button]").isVisible()).toBe(false);
  });
});

describe("with reduced motion", () => {
  const motion = async (reducedMotion: boolean) => {
    const { page } = await openPage(site, path, { width: 375, reducedMotion });
    await page.getByRole("button", { name: "Menu" }).click();
    return page.evaluate(() => ({
      animations: document.getAnimations().length,
      moving: [...document.querySelectorAll("*")].filter((element) =>
        getComputedStyle(element)
          .transitionDuration.split(",")
          .some((duration) => Number.parseFloat(duration) > 0),
      ).length,
    }));
  };

  it("animates nothing", async () => {
    expect(await motion(true)).toEqual({ animations: 0, moving: 0 });
  });

  it("animates the menu without it, so the check above can fail", async () => {
    expect((await motion(false)).moving).toBeGreaterThan(0);
  });
});

describe("the sidebar", () => {
  it("marks the page the reader is on, and only that one", async () => {
    const { page } = await openPage(site, path, { width: 1280 });
    const current = page
      .getByRole("navigation", { name: "Docs" })
      .locator('[aria-current="page"]');

    expect(await current.allTextContents()).toEqual(["What you need"]);
    expect(await current.getAttribute("href")).toBe(path);
  });
});
