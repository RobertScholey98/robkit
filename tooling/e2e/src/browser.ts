import { setTimeout as sleep } from "node:timers/promises";
import { chromium, type Browser, type Page, type Request } from "playwright";

let lines: string[] = [];

/** What every browser launched since the last call saw, then forgets it. */
export function takeBrowserLog(): string {
  const log = lines.join("\n");
  lines = [];
  return log;
}

function note(line: string): void {
  lines.push(`${new Date().toISOString()} ${line}`);
}

/** Each request a page has started that has neither finished nor failed, and when it started. */
const loadingOn = new WeakMap<Page, Map<Request, string>>();
/** When each page last started or finished a request. */
const changedOn = new WeakMap<Page, number>();

function track(page: Page): void {
  const loading = new Map<Request, string>();
  loadingOn.set(page, loading);
  changedOn.set(page, Date.now());
  page.on("request", (request) => {
    // As Playwright's networkidle does, since an event stream never ends.
    if (request.resourceType() === "eventsource") return;
    loading.set(request, new Date().toISOString());
    changedOn.set(page, Date.now());
  });
  const done = (request: Request) => {
    if (loading.delete(request)) changedOn.set(page, Date.now());
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
}

/**
 * Waits until `page` has had no request loading for 500 ms, which is what
 * Playwright's `networkidle` means. Use this instead: if a page goes quiet
 * for 500 ms before its `load` event, then loads something more, `load`
 * takes back the `networkidle` Playwright fired and nothing fires it again.
 * A Next dev page does that when the machine is busy.
 */
export async function networkIdle(page: Page, timeout = 30_000): Promise<void> {
  const loading = loadingOn.get(page);
  if (!loading) {
    throw new Error(
      `networkIdle can only wait on a page from a browser that launch() started, and the one at ${page.url()} isn't.`,
    );
  }
  const deadline = Date.now() + timeout;
  while (loading.size > 0 || Date.now() - (changedOn.get(page) ?? 0) < 500) {
    if (Date.now() >= deadline) {
      const what = [...loading.keys()].map(
        (request) =>
          `${request.resourceType()} ${request.method()} ${request.url()}`,
      );
      throw new Error(
        `${page.url()} was still loading after ${String(timeout)} ms: ${what.join(", ")}`,
      );
    }
    await sleep(50);
  }
}

/**
 * Chromium, with every context noting what went wrong in it: console errors,
 * page errors, failed requests, 4xx and 5xx answers and each navigation. On
 * close it notes each request still loading, which is what keeps
 * `networkIdle` waiting, and each open page's URL and text, so a journey
 * that timed out says what the page showed instead.
 */
export async function launch(
  options?: Parameters<typeof chromium.launch>[0],
): Promise<Browser> {
  const browser = await chromium.launch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (contextOptions) => {
    const context = await newContext(contextOptions);
    context.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        note(
          `console.${message.type()} ${message.text()} (${message.location().url})`,
        );
      }
    });
    context.on("weberror", (error) => {
      note(`page error ${error.error().message}`);
    });
    context.on("requestfailed", (request) => {
      note(
        `request failed ${request.url()}: ${request.failure()?.errorText ?? ""}`,
      );
    });
    context.on("response", (response) => {
      if (response.status() >= 400) {
        note(`${String(response.status())} ${response.url()}`);
      }
    });
    context.on("page", (page) => {
      track(page);
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) note(`navigated to ${frame.url()}`);
      });
    });
    return context;
  };
  const close = browser.close.bind(browser);
  browser.close = async (closeOptions) => {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        for (const [request, since] of loadingOn.get(page) ?? []) {
          note(
            `still loading at close, since ${since}: ${request.resourceType()} ${request.method()} ${request.url()}`,
          );
        }
        const text = await page
          .evaluate(() => document.body.innerText)
          .catch((error: unknown) => `(unreadable: ${String(error)})`);
        note(`open at close: ${page.url()}\n${text.slice(0, 2000)}`);
      }
    }
    await close(closeOptions);
  };
  return browser;
}
