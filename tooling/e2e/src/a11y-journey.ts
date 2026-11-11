import { expect, it } from "vitest";
import type { DevStack } from "./dev-stack.ts";
import { addedSlug } from "./install.ts";
import type { Slug } from "@robkit/input";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import type { Page } from "playwright";
import { launch } from "./browser.ts";
import type { JourneyOptions } from "./owner-journey.ts";
import { exampleSlug } from "./install.ts";

/** The axe rules each page broke, by page. */
export type A11yJourney = Record<string, string[]>;

/**
 * Opens the hub signed out, then signs in as the owner and opens the
 * launcher, the hub's question for an intro link, the launcher an app sent
 * the owner back to, admin, the example app and the app robkit add made.
 * axe checks
 * each page as it stands. With `screenshots`, each page is saved there too,
 * named `<prefix>-<page>.png`.
 */
export async function a11yJourney({
  install,
  username,
  password,
  slug,
  screenshots,
}: Omit<JourneyOptions, "adminUrl"> & {
  slug: Slug;
  screenshots?: { dir: string; prefix: string } | undefined;
}): Promise<A11yJourney> {
  const at = (app: Slug) => `${install.origin(app)}/`;
  const broken: A11yJourney = {};
  const check = async (page: Page, name: string) => {
    const { violations } = await new AxeBuilder({ page }).analyze();
    broken[name] = violations.map((violation) => violation.id);
    if (screenshots) {
      await page.screenshot({
        path: join(screenshots.dir, `${screenshots.prefix}-${name}.png`),
        fullPage: true,
      });
    }
  };

  const browser = await launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(at("hub"));
    await page.getByLabel("Access code").waitFor();
    await check(page, "hub-sign-in");

    await page.getByRole("button", { name: "I'm the owner" }).click();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Sign out" }).waitFor();
    await page.getByText("Loading apps…").waitFor({ state: "detached" });
    await check(page, "launcher");

    // An intro link while signed in asks first. Staying sends core nothing.
    await page.goto(`${install.origin("hub")}/i/a11ycheck`);
    await page
      .getByRole("heading", { name: "Sign in with this link instead?" })
      .waitFor();
    await check(page, "hub-intro-question");
    await page
      .getByRole("button", { name: `Stay signed in as ${username}` })
      .click();
    await page.getByRole("button", { name: "Sign out" }).waitFor();

    // The hub forwards to a next once; coming back with it shows the line.
    const toExample = `${install.origin("hub")}/?next=${encodeURIComponent(at(exampleSlug))}`;
    await page.goto(toExample);
    await page.waitForURL(at(exampleSlug));
    await page.goto(toExample);
    await page.getByRole("status").waitFor();
    await page.getByText("Loading apps…").waitFor({ state: "detached" });
    await check(page, "launcher-sent-back");

    await page.goto(at("admin"));
    await page.getByRole("heading", { name: "Access codes" }).waitFor();
    await page.getByRole("heading", { name: "Roles" }).waitFor();
    await check(page, "admin");

    await page.goto(at(exampleSlug));
    await page.getByTestId("viewer-id").waitFor();
    await check(page, "example");

    await page.goto(at(slug));
    await page.getByRole("heading").waitFor();
    await check(page, "added");
    return broken;
  } finally {
    await browser.close();
  }
}

/**
 * The accessibility journey, as a test of `dev`. `E2E_SCREENSHOTS` names a
 * folder to save each page in, to look at, each named after `prefix`.
 */
export function testA11yJourney(dev: DevStack, prefix: string): void {
  it("draws every page with no accessibility violations axe finds", async () => {
    await dev.claimed();
    const dir = process.env.E2E_SCREENSHOTS;

    const journey = await a11yJourney({
      ...dev.journey(),
      slug: addedSlug,
      screenshots: dir ? { dir, prefix } : undefined,
    });

    expect(journey).toEqual({
      "hub-sign-in": [],
      launcher: [],
      "hub-intro-question": [],
      "launcher-sent-back": [],
      admin: [],
      example: [],
      added: [],
    });
  });
}
