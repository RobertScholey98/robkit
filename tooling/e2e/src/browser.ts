import { chromium, type Browser } from "playwright";

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

/**
 * Chromium, with every context noting what went wrong in it: console errors,
 * page errors, failed requests, 4xx and 5xx answers and each navigation. On
 * close it notes each open page's URL and text, so a journey that timed out
 * says what the page showed instead.
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
