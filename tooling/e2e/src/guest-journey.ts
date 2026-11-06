import type { Slug } from "@robkit/session/addresses";
import type { Browser, Page } from "playwright";
import { launch } from "./browser.ts";
import {
  expiredTwin,
  mainFrameRequests,
  sessionCookieFor,
  type JourneyOptions,
} from "./owner-journey.ts";
import { exampleSlug } from "./install.ts";

/** How an app answered a page load. */
export interface Answer {
  status: number | undefined;
  body: string | undefined;
}

/** What the owner and two guests saw. */
export interface GuestJourney {
  /** The code the owner minted in admin, and the intro link admin showed. */
  code: string | null;
  introLink: string | null;
  /** Where opening the intro link landed, and what the hub said there. */
  introLandedAt: string;
  introGreeting: string | null;
  /** How admin and the owner-only example app answered that guest. */
  admin: Answer;
  example: Answer;
  /** What the hub said to a guest who typed the test code. */
  testCodeGreeting: string | null;
  /** The code's standing in admin once the owner revoked it. */
  revokedStanding: string | null;
  /**
   * Each page the guest's browser requested next, with the example's token
   * expired.
   */
  bounce: string[];
  /** Where that ended. */
  afterRevokeAt: string;
}

async function openAs(page: Page, url: string): Promise<Answer> {
  const res = await page.goto(url);
  return { status: res?.status(), body: await res?.text() };
}

async function signedInAs(page: Page): Promise<string | null> {
  return page.getByText("Signed in as").textContent();
}

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/**
 * The owner mints a code in admin. A guest signs in with its intro link and
 * is turned away from owner-only apps. Another guest types the test code.
 * Then the owner revokes the first guest's code, and their next refresh
 * signs them out.
 */
export async function guestJourney({
  install,
  adminUrl,
  username,
  password,
}: JourneyOptions): Promise<GuestJourney> {
  const at = (slug: Slug, path = "/") => `${install.origin(slug)}${path}`;
  const browser = await launch();
  try {
    const owner = await freshPage(browser);
    await owner.goto(at("admin"));
    await owner.getByRole("button", { name: "I'm the owner" }).click();
    await owner.getByLabel("Username").fill(username);
    await owner.getByLabel("Password").fill(password);
    await owner.getByRole("button", { name: "Sign in" }).click();
    await owner.waitForURL(at("admin"));
    await owner.getByLabel("Guest's name").fill("Grandma");
    await owner.getByRole("button", { name: "Mint code" }).click();
    const row = owner.getByRole("row").filter({ hasText: "Grandma" });
    const code = await row.getByRole("cell").nth(1).textContent();
    const introLink = await row.getByTestId("intro-link").textContent();

    const guest = await freshPage(browser);
    await guest.goto(introLink ?? "");
    const introGreeting = await signedInAs(guest);
    const introLandedAt = guest.url();
    const admin = await openAs(guest, at("admin"));
    const example = await openAs(guest, at(exampleSlug));

    const tester = await freshPage(browser);
    await tester.goto(at("hub"));
    await tester.getByLabel("Access code").fill("test");
    await tester.getByRole("button", { name: "Sign in" }).click();
    const testCodeGreeting = await signedInAs(tester);

    await row.getByRole("button", { name: "Revoke" }).click();
    const revokedStanding = await row.getByText("Revoked").textContent();

    const context = guest.context();
    const cookie = await sessionCookieFor(context, at(exampleSlug));
    await context.addCookies([
      { ...cookie, value: await expiredTwin(cookie.value, adminUrl) },
    ]);
    const bounce = mainFrameRequests(guest);
    await guest.goto(at(exampleSlug));
    await guest.getByLabel("Access code").waitFor();

    return {
      code,
      introLink,
      introLandedAt,
      introGreeting,
      admin,
      example,
      testCodeGreeting,
      revokedStanding,
      bounce,
      afterRevokeAt: guest.url(),
    };
  } finally {
    await browser.close();
  }
}
