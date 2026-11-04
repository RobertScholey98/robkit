import { expect, test, type Page } from "@playwright/test";
import { addresses } from "./stack.ts";

const at = (slug: string, path = "/") => `${addresses.origin(slug)}${path}`;

/** Opens `url` once it's served. Until every app is up, the proxy answers 502. */
async function open(page: Page, url: string): Promise<void> {
  await expect(async () => {
    const response = await page.goto(url);
    expect(response?.status()).toBeLessThan(500);
  }).toPass({ timeout: 120_000 });
}

test.describe.configure({ mode: "serial" });

test("the owner sets up the install on the way to the example app", async ({
  page,
}) => {
  const example = at("example");

  await open(page, example);
  await expect(page).toHaveURL(
    at("hub", `/?next=${encodeURIComponent(example)}`),
  );
  await page.getByLabel("Username").fill("owner");
  await page
    .getByLabel("Password", { exact: true })
    .fill("correct horse battery");
  await page.getByLabel("Confirm password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create owner" }).click();

  await expect(page).toHaveURL(example);
  await expect(
    page.getByRole("heading", { name: "Signed in as the owner" }),
  ).toBeVisible();
});

test("a guest signs in with the local test code", async ({ page }) => {
  await open(page, at("hub"));
  await page.getByLabel("Access code").fill("test");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Signed in as")).toBeVisible();
});
