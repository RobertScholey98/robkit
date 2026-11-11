// Opens the built site in Chromium for the browser tests: the server over
// dist, one browser, and a page per case at a width, a theme and with
// scripts on or off.

import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { onTestFinished } from "vitest";
import { repoRoot } from "../repo.ts";
import { serveSite } from "./serve.ts";

export interface Site {
  origin: string;
  browser: Browser;
  close: () => Promise<void>;
}

/** Serves the built site and starts Chromium. */
export async function openSite(): Promise<Site> {
  const server = await serveSite(join(repoRoot, "site", "dist"));
  const browser = await chromium.launch();
  return {
    origin: server.origin,
    browser,
    close: async () => {
      // Each test closes what it opened. A context left open costs memory
      // for the rest of the run, which made a run of every page take minutes.
      const left = browser.contexts().length;
      await browser.close();
      await server.close();
      if (left > 0) {
        throw new Error(
          `${String(left)} browser contexts were left open. Open pages with openPage, which closes each one when its test ends.`,
        );
      }
    },
  };
}

export interface View {
  width: 375 | 1280;
  theme?: "light" | "dark";
  scripts?: boolean;
  reducedMotion?: boolean;
  /** A theme the reader chose before, as the toggle stores it. */
  stored?: "light" | "dark";
  /**
   * An address to answer with 204 No Content, which leaves the browser on
   * the page it was on. A page that sends the reader on at once then stays
   * to be checked.
   */
  stay?: string | undefined;
}

export interface Opened {
  page: Page;
  /** Every address the page asked for, in order. */
  requests: string[];
}

/** Opens `path` in a fresh context set up as `view` says, closed when the test ends. */
export async function openPage(
  site: Site,
  path: string,
  {
    width,
    theme = "light",
    scripts = true,
    reducedMotion = false,
    stored,
    stay,
  }: View,
): Promise<Opened> {
  const context = await site.browser.newContext({
    viewport: { width, height: 800 },
    colorScheme: theme,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    javaScriptEnabled: scripts,
  });
  onTestFinished(() => context.close());
  if (stored !== undefined) {
    await context.addInitScript((value) => {
      localStorage.setItem("robkit-theme", value);
    }, stored);
  }
  if (stay !== undefined) {
    await context.route(`${site.origin}${stay}`, (route) =>
      route.fulfill({ status: 204 }),
    );
  }
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  // The load event, then the fonts, since axe measures text as drawn.
  // Waiting for the network to go quiet cost half a second a page.
  await page.goto(`${site.origin}${path}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  return { page, requests };
}

/** The page's background colour, as the browser computes it. */
export const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
