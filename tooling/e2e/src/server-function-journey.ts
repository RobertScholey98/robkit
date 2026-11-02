import { chromium, type Page } from "playwright";
import {
  expiredTwin,
  mainFrameRequests,
  type JourneyOptions,
} from "./owner-journey.ts";

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
  devPort,
  adminUrl,
  username,
  password,
}: JourneyOptions): Promise<ServerFunctionJourney> {
  const app = `http://start.robkit.localhost:${String(devPort)}/`;
  const browser = await chromium.launch();
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

    const cookie = (await context.cookies()).find(
      (c) => c.name === "robkit_session",
    );
    if (!cookie) throw new Error("signing in set no session cookie");
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
