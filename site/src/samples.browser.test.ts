// The samples page in Chromium: each piece a docs page uses to show code,
// as a reader meets it.

import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { switcherStacks } from "./stacks.ts";
import { openPage, openSite, type Site } from "./test/browser.ts";

const path = "/samples/";

/**
 * Each piece of the text in `selector`, split where `between` matches,
 * that the page draws across two lines.
 */
const brokenWords = (page: Page, selector: string, between: RegExp) =>
  page.locator(selector).evaluateAll((elements, pattern) => {
    const split = new RegExp(pattern);
    const range = document.createRange();
    const broken: string[] = [];
    for (const element of elements) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        let start = 0;
        for (const piece of (node.textContent ?? "").split(split)) {
          range.setStart(node, start);
          range.setEnd(node, start + piece.length);
          const lines = new Set(
            [...range.getClientRects()].map(({ top }) => Math.round(top)),
          );
          if (lines.size > 1) broken.push(piece);
          start += piece.length;
        }
      }
    }
    return broken;
  }, between.source);

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
    page.locator("figure").filter({ hasText: "Terminal" }).first();
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

  it("has a copy button only where a reader would paste, not on what a command prints", async () => {
    const { page } = await openPage(site, "/docs/reference/robkit-command/", {
      width: 1280,
    });
    const blocks = await page
      .locator("figure.code")
      .evaluateAll((figures) =>
        figures.map((figure) => [
          figure.querySelector(".label")?.textContent.trim(),
          figure.querySelector("[data-copy]:not([hidden])") !== null,
        ]),
      );

    expect(blocks).toContainEqual(["What it prints", false]);
    expect(blocks).toContainEqual(["Terminal", true]);
    expect(
      blocks.filter(([label, copy]) => copy === (label === "What it prints")),
    ).toEqual([]);
  });

  it("breaks a long file name in its bar only after a slash, at 375 pixels", async () => {
    const { page } = await openPage(site, "/docs/build-an-app/react-hono/", {
      width: 375,
    });

    expect(await page.locator(".code .label").count()).toBeGreaterThan(3);
    expect(await brokenWords(page, ".code .label", /(?<=\/)/)).toEqual([]);
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

describe("the stack switcher", () => {
  const labels = switcherStacks.map(({ label }) => label);
  const chosen = (page: Page) =>
    page.getByRole("tab", { selected: true }).textContent();
  const shown = (page: Page) =>
    page
      .locator("[data-stack-panel]")
      .evaluateAll((panels) =>
        panels
          .filter((panel) => panel.checkVisibility())
          .map((panel) => panel.dataset.stackPanel),
      );

  it("offers create-robkit's ready stacks, in order", async () => {
    const { page } = await openPage(site, path, { width: 1280 });

    expect(await page.getByRole("tab").allTextContents()).toEqual(labels);
    expect(await chosen(page)).toBe("TanStack Start");
    expect(await shown(page)).toEqual(["start"]);
  });

  it("moves between stacks with the arrow keys, Home and End", async () => {
    const { page } = await openPage(site, path, { width: 375 });
    await page.getByRole("tab", { name: "TanStack Start" }).focus();

    await page.keyboard.press("ArrowRight");
    expect(await chosen(page)).toBe("React + Hono");
    expect(await shown(page)).toEqual(["react-hono"]);
    await page.keyboard.press("End");
    expect(await chosen(page)).toBe("React + Go");
    await page.keyboard.press("ArrowRight");
    expect(await chosen(page)).toBe("TanStack Start");
    await page.keyboard.press("ArrowLeft");
    expect(await chosen(page)).toBe("React + Go");
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(
      "React + Go",
    );
    await page.keyboard.press("Home");
    expect(await chosen(page)).toBe("TanStack Start");
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute("role") ?? "",
      ),
    ).toBe("tabpanel");
  });

  it("keeps the choice on the next page", async () => {
    const { page } = await openPage(site, path, { width: 1280 });
    await page.getByRole("tab", { name: "Next.js" }).click();
    await page.goto(`${site.origin}/docs/get-started/what-you-need/`);
    await page.goto(`${site.origin}${path}`);

    expect(await chosen(page)).toBe("Next.js");
    expect(await shown(page)).toEqual(["next"]);
  });

  it("shows every stack's sample under its name without scripts", async () => {
    const { page } = await openPage(site, path, {
      width: 375,
      scripts: false,
    });

    expect(await page.getByRole("tab").count()).toBe(0);
    expect(await shown(page)).toEqual(switcherStacks.map(({ value }) => value));
    for (const { value, label } of switcherStacks) {
      const panel = page.locator(`[data-stack-panel="${value}"]`);
      expect(await panel.getByText(label, { exact: true }).isVisible()).toBe(
        true,
      );
      expect(await panel.locator("pre").textContent()).toBe(
        `pnpm robkit add notes --stack ${value}`,
      );
    }
  });
});

describe("the callouts", () => {
  it("say their kind in words, not by colour alone", async () => {
    const { page } = await openPage(site, path, { width: 375 });
    const kinds = page.getByRole("note").locator(":scope > p:first-child");

    // A note, a warning, then the pre-release line, which is a note.
    expect(await kinds.allTextContents()).toEqual(["Note", "Warning", "Note"]);
  });
});
