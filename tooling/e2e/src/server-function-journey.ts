import { expect, it } from "vitest";
import { handedBack, refreshing } from "./bounces.ts";
import type { DevStack } from "./dev-stack.ts";
import type { Page } from "playwright";
import { launch } from "./browser.ts";
import {
  expiredTwin,
  mainFrameRequests,
  sessionCookieFor,
  type JourneyOptions,
} from "./owner-journey.ts";
import { exampleSlug } from "./install.ts";

/** What the owner saw calling the Start example's server function. */
export interface ServerFunctionJourney {
  /** The visit count on the page, then after one call with a live session. */
  visits: [number, number];
  /** Each page the browser requested after a call with an expired token. */
  bounce: string[];
  /** Where that ended, and the count the reloaded page showed. */
  bouncedTo: string;
  visitsAfterBounce: number;
}

async function visitsOn(page: Page): Promise<number> {
  const text = (await page.getByTestId("visits").textContent()) ?? "";
  return Number(text.replace("Visits: ", ""));
}

/**
 * The owner signs in and calls the Start example's server function from the
 * page. Then their token expires without a page load, and the next call
 * sends the browser through core's refresh and back to the page.
 */
export async function serverFunctionJourney({
  install,
  adminUrl,
  username,
  password,
}: JourneyOptions): Promise<ServerFunctionJourney> {
  const app = `${install.origin(exampleSlug)}/`;
  const browser = await launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(app);
    await page.getByRole("button", { name: "I'm the owner" }).click();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(app);
    // The button works once React has hydrated the page.
    await page.waitForLoadState("networkidle");

    const first = await visitsOn(page);
    await page.getByRole("button", { name: "Visit again" }).click();
    await page.getByText(`Visits: ${String(first + 1)}`).waitFor();
    const second = await visitsOn(page);

    const cookie = await sessionCookieFor(context, app);
    await context.addCookies([
      { ...cookie, value: await expiredTwin(cookie.value, adminUrl) },
    ]);
    const bounce = mainFrameRequests(page);
    const back = page.waitForRequest(
      (request) => request.isNavigationRequest() && request.url() === app,
    );
    await page.getByRole("button", { name: "Visit again" }).click();
    await back;
    await page.waitForLoadState();

    return {
      visits: [first, second],
      bounce,
      bouncedTo: page.url(),
      visitsAfterBounce: await visitsOn(page),
    };
  } finally {
    await browser.close();
  }
}

/**
 * The server function journey, as a test of `dev`. Only a Start app has
 * server functions, so it runs only when `runs` says the example is one.
 */
export function testServerFunctionJourney(dev: DevStack, runs: boolean): void {
  it.runIf(runs)(
    "sends a server function call with an expired session through core's refresh",
    async () => {
      await dev.claimed();
      const example = dev.at(exampleSlug);

      const journey = await serverFunctionJourney(dev.journey());

      const [first] = journey.visits;
      expect(journey).toEqual({
        visits: [first, first + 1],
        bounce: [
          dev.at(
            exampleSlug,
            `/_robkit/refresh?next=${encodeURIComponent(example)}`,
          ),
          refreshing(dev, example),
          handedBack(example, { token: true }),
          example,
        ],
        bouncedTo: example,
        // The expired call recorded nothing. The page load after it did.
        visitsAfterBounce: first + 2,
      });
    },
  );
}
