import type { Browser, Page } from "playwright";
import { launch as launchChromium } from "./browser.ts";
import type { Install } from "@robkit/session/addresses";

/**
 * Chromium sends every robkit.test name to Caddy on this machine, and takes
 * Caddy's certificates, as a browser takes a real host's.
 */
async function launch(): Promise<Browser> {
  return launchChromium({
    args: ["--host-resolver-rules=MAP *.robkit.test 127.0.0.1"],
  });
}

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
}

/** What the owner saw while claiming a fresh install and sharing an app. */
export interface OwnerSetUp {
  /** The hub's heading on the first visit. */
  firstVisit: string | null;
  /** Whether the setup screen showed again once the owner had claimed it. */
  setupAfterClaim: boolean;
  /** The code the owner minted in admin. */
  code: string | null;
}

/**
 * The owner claims the install on the hub's setup screen, comes back to see
 * it gone, mints a code for a guest in admin and opens `slug` to anyone.
 */
export async function ownerSetsUp(
  install: Install,
  slug: string,
): Promise<OwnerSetUp> {
  const browser = await launch();
  try {
    const owner = await freshPage(browser);
    await owner.goto(install.origin("hub"));
    // The hub asks core where the install stands before it shows a screen.
    await owner.getByText("Checking core…").waitFor({ state: "detached" });
    const firstVisit = await owner.getByRole("heading").first().textContent();
    await owner.getByLabel("Username").fill("rob");
    await owner.getByLabel("Password", { exact: true }).fill("correct horse");
    await owner.getByLabel("Confirm password").fill("correct horse");
    await owner.getByRole("button", { name: "Create owner" }).click();
    await owner.getByRole("button", { name: "Sign out" }).waitFor();
    await owner.reload();
    await owner.getByRole("button", { name: "Sign out" }).waitFor();
    const setupAfterClaim = await owner
      .getByText("Set up this install")
      .isVisible();

    await owner.goto(install.origin("admin"));
    await owner.getByLabel("Guest's name").fill("Grandma");
    await owner.getByRole("button", { name: "Mint code" }).click();
    const row = owner.getByRole("row").filter({ hasText: "Grandma" });
    const code = await row.getByRole("cell").nth(1).textContent();

    const app = owner.getByRole("listitem", { name: slug, exact: true });
    await app.getByRole("radio", { name: "Anyone" }).check();
    await app.getByRole("button", { name: "Save access" }).click();
    await app.getByRole("status").waitFor();
    return { firstVisit, setupAfterClaim, code };
  } finally {
    await browser.close();
  }
}

/** What a guest saw, signing in on the hub and opening an app. */
export interface GuestVisit {
  greeting: string | null;
  openedAt: string;
  heading: string | null;
  /** How the app answered each stylesheet its page linked. */
  stylesheets: (number | undefined)[];
}

/**
 * A guest signs in with `code` on the hub, then opens `slug` from the
 * launcher, on its own subdomain.
 */
export async function guestOpens(
  install: Install,
  code: string,
  slug: string,
): Promise<GuestVisit> {
  const browser = await launch();
  try {
    const guest = await freshPage(browser);
    await guest.goto(install.origin("hub"));
    await guest.getByLabel("Access code").fill(code);
    await guest.getByRole("button", { name: "Sign in" }).click();
    const greeting = await guest.getByText("Signed in as").textContent();
    const stylesheets: Promise<number | undefined>[] = [];
    guest.on("requestfinished", (request) => {
      if (request.resourceType() === "stylesheet") {
        stylesheets.push(request.response().then((res) => res?.status()));
      }
    });
    await guest.getByRole("main").getByRole("link", { name: slug }).click();
    await guest.waitForURL(`${install.origin(slug)}/`, { waitUntil: "load" });
    return {
      greeting,
      openedAt: guest.url(),
      heading: await guest.getByRole("heading").textContent(),
      stylesheets: await Promise.all(stylesheets),
    };
  } finally {
    await browser.close();
  }
}

/** What the hub said to someone who typed the local-only `test` code. */
export async function testCodeAnswer(install: Install): Promise<string | null> {
  const browser = await launch();
  try {
    const visitor = await freshPage(browser);
    await visitor.goto(install.origin("hub"));
    await visitor.getByLabel("Access code").fill("test");
    await visitor.getByRole("button", { name: "Sign in" }).click();
    return await visitor.getByRole("alert").textContent();
  } finally {
    await browser.close();
  }
}
