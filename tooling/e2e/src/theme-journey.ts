import { expect, it } from "vitest";
import type { DevStack } from "./dev-stack.ts";
import { launch } from "./browser.ts";
import type { JourneyOptions } from "./owner-journey.ts";

/** How the hub's sign-in page draws its card and its primary button. */
export interface Look {
  buttonBackground: string;
  buttonText: string;
  cardRadius: string;
}

/** The sign-in page's look on the install's theme, then on `changedTheme`. */
export interface ThemeJourney {
  before: Look;
  after: Look;
}

/**
 * Theme variables as an owner might change them in
 * `packages/theme/theme.css`.
 */
export const changedTheme = {
  "--primary": "rgb(200, 30, 60)",
  "--primary-foreground": "rgb(250, 240, 200)",
  "--radius": "20px",
};

/**
 * Opens the hub signed out and reads how its sign-in card and button are
 * drawn. Then sets `changedTheme`'s variables on the page, as the theme
 * file would, and reads them again.
 */
export async function themeJourney({
  install,
}: Pick<JourneyOptions, "install">): Promise<ThemeJourney> {
  const browser = await launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(`${install.origin("hub")}/`);
    const button = page.getByRole("button", { name: "Sign in" });
    // Whatever draws the card, it's the page's only child of <main>.
    const card = page.locator("main > *");
    await button.waitFor();
    // Colours fade on change, and a read mid-fade would see neither.
    await page.addStyleTag({
      content: "*, *::before, *::after { transition: none !important; }",
    });
    const look = async (): Promise<Look> => ({
      buttonBackground: await button.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
      buttonText: await button.evaluate(
        (element) => getComputedStyle(element).color,
      ),
      cardRadius: await card.evaluate(
        (element) => getComputedStyle(element).borderTopLeftRadius,
      ),
    });

    const before = await look();
    await page.evaluate((theme) => {
      for (const [name, value] of Object.entries(theme)) {
        document.documentElement.style.setProperty(name, value);
      }
    }, changedTheme);
    return { before, after: await look() };
  } finally {
    await browser.close();
  }
}

/**
 * The theme's journey, as a test of `dev`. The hub draws from the theme's
 * variables, so changing them restyles it.
 */
export function testThemeJourney(dev: DevStack): void {
  it("draws the hub from the theme's variables", async () => {
    await dev.claimed();

    const journey = await themeJourney({ install: dev.addresses() });

    expect(journey).toEqual({
      before: {
        buttonBackground: "oklch(0.205 0 0)",
        buttonText: "oklch(0.985 0 0)",
        cardRadius: "14px",
      },
      after: {
        buttonBackground: "rgb(200, 30, 60)",
        buttonText: "rgb(250, 240, 200)",
        cardRadius: "28px",
      },
    });
  });
}
