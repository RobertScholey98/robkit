import { chromium } from "playwright";
import type { JourneyOptions } from "./owner-journey.ts";

/** What a guest saw of the app robkit add made, open to anyone. */
export interface AddedAppJourney {
  /** The emoji the hub's launcher showed beside the app. */
  icon: string | null;
  /** Where the launcher's link took the guest, and the page's heading. */
  openedAt: string;
  heading: string | null;
}

/**
 * A guest signs in with the test code, finds the added app in the hub's
 * launcher with its icon, and opens it from there.
 */
export async function addedAppJourney({
  install,
  slug,
}: Pick<JourneyOptions, "install"> & {
  slug: string;
}): Promise<AddedAppJourney> {
  const at = (app: string) => `${install.origin(app)}/`;
  const browser = await chromium.launch();
  try {
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(at("hub"));
    await guest.getByLabel("Access code").fill("test");
    await guest.getByRole("button", { name: "Sign in" }).click();
    const link = guest.getByRole("main").getByRole("link", { name: slug });
    const icon = await link.locator('[aria-hidden="true"]').textContent();
    await link.click();
    await guest.waitForURL(at(slug));
    return {
      icon,
      openedAt: guest.url(),
      heading: await guest.getByRole("heading").textContent(),
    };
  } finally {
    await browser.close();
  }
}
