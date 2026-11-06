import { expect, it } from "vitest";
import type { DevStack } from "./dev-stack.ts";
import { addedSlug } from "./install.ts";
import type { Slug } from "@robkit/input";
import type { Browser, Locator, Page } from "playwright";
import { launch } from "./browser.ts";
import type { Answer } from "./guest-journey.ts";
import type { JourneyOptions } from "./owner-journey.ts";
import { exampleSlug } from "./install.ts";

/** What a guest holding Family saw as the owner gated the example app. */
export interface RoleJourney {
  /** Who a new role listed once the owner created it with select all. */
  createdWith: string;
  /** Who it listed once the owner edited it, from deselect all. */
  editedTo: string;
  /** The apps the hub listed once the example was gated to Family. */
  launcherGatedToFamily: string[];
  /** Where the launcher's link took the guest, and the page's heading. */
  openedAt: string;
  heading: string | null;
  /** The apps Sam's open hub listed once the owner gated it to Friends. */
  launcherGatedToFriends: string[];
  /** How the example app then answered the guest. */
  example: Answer;
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
  return page.getByRole("main").getByTestId("app-name").allTextContents();
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

/** The owner gates the example app to `role` in admin. */
async function gateExample(owner: Page, role: string): Promise<void> {
  const app = owner.getByRole("listitem", { name: "example", exact: true });
  await app.getByRole("radio", { name: "Guests with a role" }).check();
  for (const box of await app.getByRole("checkbox").all()) {
    await box.uncheck();
  }
  await app.getByRole("checkbox", { name: role, exact: true }).check();
  await app.getByRole("button", { name: "Save access" }).click();
  await app.getByRole("status").waitFor();
}

/**
 * The owner mints codes for Sam and Alex, creates Neighbours with select
 * all, then edits it down to Sam from deselect all. Sam gets Family too,
 * and the owner gates the example app to Family. Sam's launcher lists it,
 * and its link opens it. The owner gates it to Friends instead, and the
 * launcher Sam has open drops it without a reload. The app then answers Sam
 * with the 404.
 */
export async function roleJourney({
  install,
  username,
  password,
}: JourneyOptions): Promise<RoleJourney> {
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
    await neighbours.getByRole("checkbox", { name: /^Sam/ }).check();
    const editedTo = await saveGuests(neighbours);

    const family = owner.getByRole("listitem", { name: "Family", exact: true });
    await family.getByRole("button", { name: "Edit guests" }).click();
    await family.getByRole("checkbox", { name: /^Sam/ }).check();
    await saveGuests(family);
    await gateExample(owner, "Family");

    const guest = await freshPage(browser);
    await guest.goto(at("hub"));
    await guest.getByLabel("Access code").fill(code);
    await guest.getByRole("button", { name: "Sign in" }).click();
    await guest.getByText("Signed in as Sam").waitFor();
    const launcherGatedToFamily = await launcherApps(guest, at("hub"));
    await openUntil(guest, at(exampleSlug), 200);
    await guest.goto(at("hub"));
    await guest.getByRole("link", { name: "example" }).click();
    await guest.waitForURL(at(exampleSlug));
    const heading = await guest.getByRole("heading").textContent();
    const openedAt = guest.url();

    await guest.goto(at("hub"));
    const link = guest.getByRole("main").getByRole("link", { name: "example" });
    await link.waitFor();
    await gateExample(owner, "Friends");
    await link.waitFor({
      state: "detached",
      timeout: launcherRefreshMs + 15_000,
    });
    const launcherGatedToFriends = await guest
      .getByRole("main")
      .getByTestId("app-name")
      .allTextContents();
    const example = await openUntil(guest, at(exampleSlug), 404);

    return {
      createdWith,
      editedTo,
      launcherGatedToFamily,
      openedAt,
      heading,
      launcherGatedToFriends,
      example,
    };
  } finally {
    await browser.close();
  }
}

/**
 * The role journey, as a test of `dev`, when `runs` says so. The example
 * app keeps its rule for a minute, and this journey waits it out twice.
 */
export function testRoleJourney(dev: DevStack, runs: boolean): void {
  it.runIf(runs)(
    "lets a guest open an app through a role, and not once it's gated to another",
    { timeout: 300_000 },
    async () => {
      const journey = await roleJourney(dev.journey());

      expect(journey).toEqual({
        createdWith: "Alex, Sam",
        editedTo: "Sam",
        launcherGatedToFamily: [addedSlug, "example"],
        openedAt: dev.at(exampleSlug),
        heading: "Signed in as a guest",
        launcherGatedToFriends: [addedSlug],
        example: { status: 404, body: "Not found" },
      });
    },
  );
}
