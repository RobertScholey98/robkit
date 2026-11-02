import { chromium, type Browser, type Locator, type Page } from "playwright";
import type { Answer } from "./guest-journey.ts";
import type { JourneyOptions } from "./owner-journey.ts";

/** What a guest holding Family saw as the owner gated both example apps. */
export interface RoleJourney {
  /** Who a new role listed once the owner created it with select all. */
  createdWith: string;
  /** Who it listed once the owner edited it, from deselect all. */
  editedTo: string;
  /** The apps the hub listed once both examples were gated to Family. */
  launcherGatedToFamily: string[];
  /** Where the launcher's link took the guest, and the page's heading. */
  openedAt: string;
  heading: string | null;
  /** The apps Sam's open hub listed once the owner gated it to Friends. */
  launcherGatedToFriends: string[];
  /** How the example app then answered the guest. */
  example: Answer;
  /** How the Start example answered the guest gated to Family, then Friends. */
  start: [number | undefined, Answer];
}

/** An app keeps its rule this long, so a change in admin waits this out. */
const ruleCacheMs = 60_000;

/** How often an open launcher asks core for the viewer's apps again. */
const launcherRefreshMs = 30_000;

async function freshPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

async function launcherApps(page: Page, hub: string): Promise<string[]> {
  await page.goto(hub);
  // The launcher shows its loading line in the same render as Sign out.
  await page.getByRole("button", { name: "Sign out" }).waitFor();
  await page.getByText("Loading apps…").waitFor({ state: "detached" });
  return page.getByRole("main").getByRole("link").allTextContents();
}

/** Saves a role's guests and reads them back once admin shows the change. */
async function saveGuests(role: Locator): Promise<string> {
  const guests = role.locator("h2 + p");
  const before = (await guests.textContent()) ?? "";
  await role.getByRole("button", { name: "Save guests" }).click();
  return (await guests.filter({ hasNotText: before }).textContent()) ?? "";
}

async function mint(owner: Page, name: string): Promise<string> {
  await owner.getByLabel("Guest's name").fill(name);
  await owner.getByRole("button", { name: "Mint code" }).click();
  const row = owner.getByRole("row").filter({ hasText: name });
  return (await row.getByRole("cell").nth(1).textContent()) ?? "";
}

/** Opens `url` until it answers `status`, as an app's cached rule expires. */
async function openUntil(
  page: Page,
  url: string,
  status: number,
): Promise<Answer> {
  const deadline = Date.now() + ruleCacheMs + 15_000;
  for (;;) {
    const res = await page.goto(url);
    if (res?.status() === status || Date.now() > deadline) {
      return { status: res?.status(), body: await res?.text() };
    }
    await page.waitForTimeout(2_000);
  }
}

/** The owner gates both example apps to `role` in admin. */
async function gateExamples(owner: Page, role: string): Promise<void> {
  for (const slug of ["example", "start"]) {
    const app = owner.getByRole("listitem", { name: slug, exact: true });
    await app.getByLabel("Guests with a role").check();
    for (const box of await app.getByRole("checkbox").all()) {
      await box.uncheck();
    }
    await app.getByLabel(role, { exact: true }).check();
    await app.getByRole("button", { name: "Save access" }).click();
    await app.getByRole("status").waitFor();
  }
}

/**
 * The owner mints codes for Sam and Alex, creates Neighbours with select
 * all, then edits it down to Sam from deselect all. Sam gets Family too,
 * and the owner gates both example apps to Family. Sam's launcher lists
 * them, and a link opens one. The owner gates them to Friends instead, and
 * the launcher Sam has open drops them without a reload. The apps then
 * answer Sam with the 404.
 */
export async function roleJourney({
  devPort,
  username,
  password,
}: JourneyOptions): Promise<RoleJourney> {
  const at = (slug: string, path = "/") =>
    `http://${slug}.robkit.localhost:${String(devPort)}${path}`;
  const browser = await chromium.launch();
  try {
    const owner = await freshPage(browser);
    await owner.goto(at("admin"));
    await owner.getByRole("button", { name: "I'm the owner" }).click();
    await owner.getByLabel("Username").fill(username);
    await owner.getByLabel("Password").fill(password);
    await owner.getByRole("button", { name: "Sign in" }).click();
    await owner.waitForURL(at("admin"));
    const code = await mint(owner, "Sam");
    await mint(owner, "Alex");

    const create = owner.getByRole("form", { name: "Create a role" });
    await create.getByLabel("Role name").fill("Neighbours");
    await create
      .getByRole("button", { name: "Select all", exact: true })
      .click();
    await create.getByRole("button", { name: "Create role" }).click();
    const neighbours = owner.getByRole("listitem", {
      name: "Neighbours",
      exact: true,
    });
    const createdWith =
      (await neighbours.locator("h2 + p").textContent()) ?? "";
    await neighbours.getByRole("button", { name: "Edit guests" }).click();
    await neighbours
      .getByRole("button", { name: "Deselect all", exact: true })
      .click();
    await neighbours.getByLabel(/^Sam/).check();
    const editedTo = await saveGuests(neighbours);

    const family = owner.getByRole("listitem", { name: "Family", exact: true });
    await family.getByRole("button", { name: "Edit guests" }).click();
    await family.getByLabel(/^Sam/).check();
    await saveGuests(family);
    await gateExamples(owner, "Family");

    const guest = await freshPage(browser);
    await guest.goto(at("hub"));
    await guest.getByLabel("Access code").fill(code);
    await guest.getByRole("button", { name: "Sign in" }).click();
    await guest.getByText("Signed in as Sam").waitFor();
    const launcherGatedToFamily = await launcherApps(guest, at("hub"));
    await openUntil(guest, at("example"), 200);
    const startWithFamily = await openUntil(guest, at("start"), 200);
    await guest.goto(at("hub"));
    await guest.getByRole("link", { name: "example" }).click();
    await guest.waitForURL(at("example"));
    const heading = await guest.getByRole("heading").textContent();
    const openedAt = guest.url();

    await guest.goto(at("hub"));
    const link = guest.getByRole("main").getByRole("link", { name: "example" });
    await link.waitFor();
    await gateExamples(owner, "Friends");
    await link.waitFor({
      state: "detached",
      timeout: launcherRefreshMs + 15_000,
    });
    // The two gates may land either side of one launcher refresh.
    await guest
      .getByRole("main")
      .getByRole("link", { name: "start" })
      .waitFor({ state: "detached", timeout: launcherRefreshMs + 15_000 });
    const launcherGatedToFriends = await guest
      .getByRole("main")
      .getByRole("link")
      .allTextContents();
    const example = await openUntil(guest, at("example"), 404);
    const start = await openUntil(guest, at("start"), 404);

    return {
      createdWith,
      editedTo,
      launcherGatedToFamily,
      openedAt,
      heading,
      launcherGatedToFriends,
      example,
      start: [startWithFamily.status, start],
    };
  } finally {
    await browser.close();
  }
}
