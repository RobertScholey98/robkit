import type { BrowserContext, Page } from "playwright";
import { expect, it } from "vitest";
import { handedBack, refreshing } from "./bounces.ts";
import { launch } from "./browser.ts";
import type { DevStack } from "./dev-stack.ts";
import { exampleSlug } from "./install.ts";
import {
  expiredTwin,
  mainFrameRequests,
  sessionCookieFor,
  type JourneyOptions,
} from "./owner-journey.ts";

// A session that lapses while a page is open, met by a call from the page
// rather than a page load: a client navigation, which fetches the next
// page's data, and a server action. Next's example makes both.

async function visitsOn(page: Page): Promise<number> {
  const text = (await page.getByTestId("visits").textContent()) ?? "";
  return Number(text.replace("Visits: ", ""));
}

/** Signs the owner in at the hub, from `page` on the example app. */
async function signIn(
  page: Page,
  { username, password }: JourneyOptions,
): Promise<void> {
  await page.getByRole("button", { name: "I'm the owner" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Opens the example signed in as the owner, once React has hydrated it. */
async function openSignedIn(
  context: BrowserContext,
  options: JourneyOptions,
): Promise<Page> {
  const app = `${options.install.origin(exampleSlug)}/`;
  const page = await context.newPage();
  await page.goto(app);
  await signIn(page, options);
  await page.waitForURL(app);
  // Links and buttons work once React has hydrated the page.
  await page.waitForLoadState("networkidle");
  return page;
}

/** What the owner saw following a link once their token had expired. */
export interface ClientNavigationJourney {
  /** Each page the browser requested after clicking the link. */
  bounce: string[];
  /** Where that ended, and its heading. */
  landedAt: string;
  heading: string | null;
}

/**
 * The owner opens the example, their token expires, and they follow a
 * link to another page. Next's client fetches that page's data and gets
 * the guard's 401, so it loads the page in full, which goes through
 * core's refresh and back.
 */
export async function clientNavigationJourney(
  options: JourneyOptions,
): Promise<ClientNavigationJourney> {
  const visits = `${options.install.origin(exampleSlug)}/visits`;
  const browser = await launch();
  try {
    const context = await browser.newContext();
    const page = await openSignedIn(context, options);
    const cookie = await sessionCookieFor(context, visits);
    await context.addCookies([
      { ...cookie, value: await expiredTwin(cookie.value, options.adminUrl) },
    ]);

    const bounce = mainFrameRequests(page);
    await page.getByRole("link", { name: "Your latest visits" }).click();
    await page.waitForURL(visits);
    await page.waitForLoadState();

    return {
      bounce,
      landedAt: page.url(),
      heading: await page.getByRole("heading").textContent(),
    };
  } finally {
    await browser.close();
  }
}

/** What the owner saw calling a server action once signed out. */
export interface ServerActionJourney {
  /** The visit count on the page, then after one call with a live session. */
  visits: [number, number];
  /** Where the call sent the browser once the owner had signed out. */
  signInAt: string;
  /** Where signing in again landed, who it showed, and the count it showed. */
  backAt: string;
  heading: string | null;
  visitsAfterSignIn: number;
}

/**
 * The owner opens the example and calls its server action. Then they sign
 * out of core, and the app hears it, and the next call sends the browser
 * to the hub to sign in, and back to the page.
 */
export async function serverActionJourney(
  options: JourneyOptions,
): Promise<ServerActionJourney> {
  const app = `${options.install.origin(exampleSlug)}/`;
  const browser = await launch();
  try {
    const context = await browser.newContext();
    const page = await openSignedIn(context, options);
    const first = await visitsOn(page);
    await page.getByRole("button", { name: "Visit again" }).click();
    await page.getByText(`Visits: ${String(first + 1)}`).waitFor();
    const second = await visitsOn(page);

    // Core's session goes, and the app holds core's word that nobody is
    // signed in, as after the owner signs out and the app asks core again.
    await context.clearCookies({
      domain: options.install.host("core"),
      name: "robkit_session",
    });
    const cookie = await sessionCookieFor(context, app);
    await context.addCookies([
      {
        ...cookie,
        value: `signed-out.${String(Math.floor(Date.now() / 1000))}`,
      },
    ]);
    await page.getByRole("button", { name: "Visit again" }).click();
    await page.getByRole("button", { name: "I'm the owner" }).waitFor();
    const signInAt = page.url();
    await signIn(page, options);
    await page.waitForURL(app);

    return {
      visits: [first, second],
      signInAt,
      backAt: page.url(),
      heading: await page.getByRole("heading").textContent(),
      visitsAfterSignIn: await visitsOn(page),
    };
  } finally {
    await browser.close();
  }
}

/**
 * The client navigation journey, as a test of `dev`. It runs only when
 * `runs` says the example has a link a client navigation follows.
 */
export function testClientNavigationJourney(
  dev: DevStack,
  runs: boolean,
): void {
  it.runIf(runs)(
    "sends a client navigation with an expired session through core's refresh, to the page it was going to",
    async () => {
      await dev.claimed();
      const visits = dev.at(exampleSlug, "/visits");

      const journey = await clientNavigationJourney(dev.journey());

      expect(journey).toEqual({
        bounce: [
          visits,
          refreshing(dev, visits),
          handedBack(visits, { token: true }),
          visits,
        ],
        landedAt: visits,
        heading: "Your latest visits",
      });
    },
  );
}

/**
 * The server action journey, as a test of `dev`. It runs only when `runs`
 * says the example calls a server action from its page.
 */
export function testServerActionJourney(dev: DevStack, runs: boolean): void {
  it.runIf(runs)(
    "sends a server action from a signed-out page to the hub to sign in, and back",
    async () => {
      await dev.claimed();
      const example = dev.at(exampleSlug);

      const journey = await serverActionJourney(dev.journey());

      const [first] = journey.visits;
      expect(journey).toEqual({
        visits: [first, first + 1],
        signInAt: dev.at("hub", `/?next=${encodeURIComponent(example)}`),
        backAt: example,
        heading: "Signed in as the owner",
        // The refused call recorded nothing. The page load after it did.
        visitsAfterSignIn: first + 2,
      });
    },
  );
}
