import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { launch, networkIdle } from "./browser.ts";

/** Busy for `ms` on the page's main thread, without a request. */
const busy = (ms: number) =>
  `{ const end = Date.now() + ${String(ms)}; while (Date.now() < end); }`;

// The shape of a Next dev page on a loaded machine: the document and its
// first script load, the page is busy running that script for longer than
// 500 ms, then it loads one more script before `load`.
const pages: Record<string, string> = {
  "/late": `<script async src="/first.js"></script>`,
  "/first.js": `${busy(1_500)}
    const late = document.createElement("script");
    late.src = "/late.js";
    document.head.append(late);`,
  "/late.js": `${busy(300)} window.late = true;`,
  "/fetches": `<script>fetch("/slow")</script>`,
  "/hangs": `<script>fetch("/never")</script>`,
};

let slowEnded = 0;
const hanging: ServerResponse[] = [];

const server = createServer((request, response) => {
  const path = request.url ?? "/";
  if (path === "/never") {
    hanging.push(response);
    return;
  }
  if (path === "/slow") {
    setTimeout(() => {
      response.end("slow", () => (slowEnded = Date.now()));
    }, 1_000);
    return;
  }
  response.setHeader(
    "content-type",
    path.endsWith(".js") ? "text/javascript" : "text/html",
  );
  response.end(pages[path] ?? "");
});
let origin = "";

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(() => {
  for (const response of hanging) response.destroy();
  server.close();
});

async function openPage(path: string) {
  const browser = await launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${origin}${path}`);
  return { browser, page };
}

describe("networkIdle", () => {
  // Playwright fires networkidle in the quiet gap, then load takes it back
  // after the late script, and nothing fires it again. If this starts
  // passing, Playwright has fixed it and networkIdle can go.
  //
  // Whether the gap falls where the bug needs it depends on timing, and a
  // busy CI runner missed it once, on 2026-11-11. So it gets three more
  // tries. A Playwright that has fixed the bug fails all four.
  it(
    "is a page Playwright's own networkidle never reaches",
    { retry: 3 },
    async () => {
      const { browser, page } = await openPage("/late");
      try {
        await expect(
          page.waitForLoadState("networkidle", { timeout: 3_000 }),
        ).rejects.toThrow("Timeout 3000ms exceeded");
      } finally {
        await browser.close();
      }
    },
  );

  it("resolves on that page once its late script has run", async () => {
    const { browser, page } = await openPage("/late");
    try {
      await networkIdle(page, 3_000);
      expect(await page.evaluate(() => "late" in window)).toBe(true);
    } finally {
      await browser.close();
    }
  });

  it("waits 500 ms after the last request in flight finishes", async () => {
    const { browser, page } = await openPage("/fetches");
    try {
      await networkIdle(page);
      expect(slowEnded).toBeGreaterThan(0);
      expect(Date.now() - slowEnded).toBeGreaterThanOrEqual(500);
    } finally {
      await browser.close();
    }
  });

  it("names what is still loading when it gives up", async () => {
    const { browser, page } = await openPage("/hangs");
    try {
      await expect(networkIdle(page, 1_000)).rejects.toThrow(
        `${origin}/hangs was still loading after 1000 ms: fetch GET ${origin}/never`,
      );
    } finally {
      await browser.close();
    }
  });

  it("refuses a page from a browser launch didn't start", async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await expect(networkIdle(page)).rejects.toThrow(
        "networkIdle can only wait on a page from a browser that launch() started, and the one at about:blank isn't.",
      );
    } finally {
      await browser.close();
    }
  });
});
