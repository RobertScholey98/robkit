// The samples page in Chromium: each piece a docs page uses to show code,
// as a reader meets it.

import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
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

describe("a code block", () => {
  it("shows each character as typed, with no ligatures", async () => {
    const { page } = await openPage(site, path, { width: 1280 });
    const style = await page
      .locator("pre")
      .first()
      .evaluate((pre) => {
        const { fontVariantLigatures, tabSize } = getComputedStyle(pre);
        return { fontVariantLigatures, tabSize };
      });

    expect(style).toEqual({ fontVariantLigatures: "none", tabSize: "4" });
  });

  const terminal = (page: Page) =>
    page.locator("figure").filter({ hasText: "Terminal" });
  // What the page hands the clipboard, exactly. Reading the clipboard back
  // gives the system's line endings, which differ on Windows.
  const recordCopies = (page: Page) =>
    page.evaluate(() => {
      const write = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async (text) => {
        document.body.dataset.copied = text;
        await write(text);
      };
    });
  const copied = (page: Page) =>
    page.evaluate(() => document.body.dataset.copied);

  it("names its file, or Terminal for commands, with a prompt that isn't copied", async () => {
    const { page } = await openPage(site, path, { width: 1280 });
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    const block = terminal(page);

    expect(await page.locator("figcaption").first().textContent()).toContain(
      "addresses.ts",
    );
    expect(
      await block
        .locator(".line")
        .evaluateAll((lines) =>
          lines.map((line) => getComputedStyle(line, "::before").content),
        ),
    ).toEqual(['"$ "', '"$ "']);
    await recordCopies(page);
    await block.getByRole("button", { name: "Copy" }).click();

    await expect
      .poll(() => copied(page))
      .toBe("pnpm robkit add notes\npnpm dev");
    await expect
      .poll(() => block.getByRole("status").textContent())
      .toBe("Copied");
    expect(await block.getByRole("button").textContent()).toBe("Copied");
  });

  it("copies from the keyboard", async () => {
    const { page } = await openPage(site, path, { width: 375 });
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await recordCopies(page);
    await terminal(page).getByRole("button", { name: "Copy" }).focus();
    await page.keyboard.press("Enter");

    await expect
      .poll(() => copied(page))
      .toBe("pnpm robkit add notes\npnpm dev");
  });

  it("says so when the browser refuses the clipboard", async () => {
    const { page } = await openPage(site, path, { width: 1280 });
    await page.evaluate(() => {
      navigator.clipboard.writeText = () =>
        Promise.reject(new DOMException("Refused", "NotAllowedError"));
    });
    const block = terminal(page);
    await block.getByRole("button", { name: "Copy" }).click();

    await expect
      .poll(() => block.getByRole("status").textContent())
      .toBe("Your browser didn't allow copying. Select the code to copy it.");
    expect(await block.getByRole("button").textContent()).toBe("Couldn't copy");
  });

  it("has no copy button without scripts, and its code still shows", async () => {
    const { page } = await openPage(site, path, {
      width: 375,
      scripts: false,
    });

    expect(await page.getByRole("button", { name: "Copy" }).count()).toBe(0);
    expect(await terminal(page).locator("pre").isVisible()).toBe(true);
  });
});
