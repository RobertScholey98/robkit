import { decodeJwt, importJWK, SignJWT, type JWK } from "jose";
import { chromium, type Page } from "playwright";
import postgres from "postgres";

export interface JourneyOptions {
  /** The dev proxy's port. */
  devPort: number;
  /** A superuser URL for the install's database. */
  adminUrl: string;
  username: string;
  password: string;
}

/** What the browser saw on its way through the example app. */
export interface Journey {
  /** Where opening the example app signed out landed. */
  signedOutAt: string;
  /** Where signing in at the hub landed. */
  signedInAt: string;
  heading: string | null;
  viewerId: string | null;
  /** The owner id in the session cookie. */
  ownerId: string;
  /** Each page the browser requested opening the app with an expired token. */
  bounce: string[];
  /** Where that ended, and who the app saw. */
  bouncedTo: string;
  bouncedViewerId: string | null;
}

/**
 * A session token for the same session, expired five minutes ago and signed
 * with core's own key, so the app must bounce it through core's /refresh.
 */
async function expiredTwin(token: string, adminUrl: string): Promise<string> {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  const [key] = await sql<{ kid: string; private_jwk: JWK }[]>`
    select kid, private_jwk from core.signing_keys
  `.finally(() => sql.end());
  if (!key) throw new Error("core has no signing key");
  const { sub, sid } = decodeJwt(token);
  if (typeof sub !== "string" || typeof sid !== "string") {
    throw new Error("the session cookie has no owner or session");
  }
  const iat = Math.floor(Date.now() / 1000) - 20 * 60;
  return new SignJWT({ sid, kind: "owner" })
    .setProtectedHeader({ alg: "EdDSA", kid: key.kid })
    .setSubject(sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 15 * 60)
    .sign(await importJWK(key.private_jwk, "EdDSA"));
}

function mainFrameRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      urls.push(request.url());
    }
  });
  return urls;
}

/**
 * Opens the example app signed out, signs in at the hub as the owner, then
 * opens it again with an expired token.
 */
export async function ownerJourney({
  devPort,
  adminUrl,
  username,
  password,
}: JourneyOptions): Promise<Journey> {
  const example = `http://example.robkit.localhost:${String(devPort)}/`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(example);
    const signedOutAt = page.url();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(example);
    const signedInAt = page.url();
    const heading = await page.getByRole("heading").textContent();
    const viewerId = await page.getByTestId("viewer-id").textContent();

    const cookie = (await context.cookies()).find(
      (c) => c.name === "robkit_session",
    );
    if (!cookie) throw new Error("signing in set no session cookie");
    await context.addCookies([
      { ...cookie, value: await expiredTwin(cookie.value, adminUrl) },
    ]);
    const bounce = mainFrameRequests(page);
    await page.goto(example);

    return {
      signedOutAt,
      signedInAt,
      heading,
      viewerId,
      ownerId: String(decodeJwt(cookie.value).sub),
      bounce,
      bouncedTo: page.url(),
      bouncedViewerId: await page.getByTestId("viewer-id").textContent(),
    };
  } finally {
    await browser.close();
  }
}
