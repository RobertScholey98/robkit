import { decodeJwt, importJWK, SignJWT, type JWK } from "jose";
import type { BrowserContext, Cookie, Page } from "playwright";
import { launch } from "./browser.ts";
import postgres from "postgres";
import type { Install } from "@robkit/session/addresses";
import { exampleSlug } from "./install.ts";

export interface JourneyOptions {
  /** The install's addresses under pnpm dev. */
  install: Install;
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
  /** The owner id in the example's session cookie. */
  ownerId: string;
  /** The example's own token, which only the example accepts. */
  appToken: string;
  /** The hosts the browser holds a session cookie for. */
  sessionCookieHosts: string[];
  /** Each page the browser requested opening the app with an expired token. */
  bounce: string[];
  /** Where that ended, and who the app saw. */
  bouncedTo: string;
  bouncedViewerId: string | null;
}

/**
 * A token for the same viewer and audience, expired five minutes ago and
 * signed with core's own key, so the app must bounce it through core's
 * /refresh.
 */
export async function expiredTwin(
  token: string,
  adminUrl: string,
): Promise<string> {
  const sql = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  const [key] = await sql<{ kid: string; private_jwk: JWK }[]>`
    select kid, private_jwk from core.signing_keys
  `.finally(() => sql.end());
  if (!key) throw new Error("core has no signing key");
  const claims = decodeJwt(token);
  const { sub } = claims;
  if (typeof sub !== "string") throw new Error("the token names no one");
  const iat = Math.floor(Date.now() / 1000) - 20 * 60;
  // Every claim, so a guest's twin keeps their roles. The times are reset.
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: key.kid })
    .setSubject(sub)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 15 * 60)
    .sign(await importJWK(key.private_jwk, "EdDSA"));
}

/** The session cookie the browser holds for `url`'s host, which only it gets. */
export async function sessionCookieFor(
  context: BrowserContext,
  url: string,
): Promise<Cookie> {
  const { hostname } = new URL(url);
  const cookie = (await context.cookies()).find(
    (c) => c.name === "robkit_session" && c.domain === hostname,
  );
  if (!cookie)
    throw new Error(`the browser holds no session cookie for ${hostname}`);
  return cookie;
}

export function mainFrameRequests(page: Page): string[] {
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
  install,
  adminUrl,
  username,
  password,
}: JourneyOptions): Promise<Journey> {
  const example = `${install.origin(exampleSlug)}/`;
  const browser = await launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(example);
    const signedOutAt = page.url();
    await page.getByRole("button", { name: "I'm the owner" }).click();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(example);
    const signedInAt = page.url();
    const heading = await page.getByRole("heading").textContent();
    const viewerId = await page.getByTestId("viewer-id").textContent();

    const cookie = await sessionCookieFor(context, example);
    const sessionCookieHosts = (await context.cookies())
      .filter((c) => c.name === "robkit_session")
      .map((c) => c.domain)
      .sort();
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
      appToken: cookie.value,
      sessionCookieHosts,
      bounce,
      bouncedTo: page.url(),
      bouncedViewerId: await page.getByTestId("viewer-id").textContent(),
    };
  } finally {
    await browser.close();
  }
}
