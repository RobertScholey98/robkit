// Opens the built site in Chromium for the browser tests: the server over
// dist, one browser, and a page per case at a width, a theme and with
// scripts on or off.

import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
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
      await browser.close();
      await server.close();
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
}

export interface Opened {
  page: Page;
  /** Every address the page asked for, in order. */
  requests: string[];
}

/** Opens `path` in a fresh context set up as `view` says. */
export async function openPage(
  site: Site,
  path: string,
  {
    width,
    theme = "light",
    scripts = true,
    reducedMotion = false,
    stored,
  }: View,
): Promise<Opened> {
  const context = await site.browser.newContext({
    viewport: { width, height: 800 },
    colorScheme: theme,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    javaScriptEnabled: scripts,
  });
  if (stored !== undefined) {
    await context.addInitScript((value) => {
      localStorage.setItem("robkit-theme", value);
    }, stored);
  }
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto(`${site.origin}${path}`, { waitUntil: "networkidle" });
  return { page, requests };
}

/** The page's background colour, as the browser computes it. */
export const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);
