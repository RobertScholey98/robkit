// The guard's and adapters' tests run against a fake core, and stand in
// for core's /refresh with @internal/test-session's helpers. This file
// holds those to real core: what the guard's tests expect a guard to send
// core is accepted, what core sends back is what the helpers say, and the
// fake's key and tokens have the fields core's have. Go's fake is held to
// the same JWK fields by go/internal/fakecore's own test.
import {
  addressAnswer,
  addressCases,
  app as example,
  callbackFor,
  cookieAnswer,
  cookieCases,
  cookieRequest,
  fakeCore,
  guest,
  refreshLocation,
} from "@internal/test-session";
import type { Hono } from "hono";
import { decodeJwt, decodeProtectedHeader, type JSONWebKeySet } from "jose";
import { describe, expect, it } from "vitest";
import {
  claim,
  freshCore,
  postJson,
  sessionCookieOf,
  withSession,
} from "./test/fresh-app.ts";

/** A state as the guard makes one: 32 random bytes, base64url. */
const state = "bG9uZy1lbm91Z2gtdG8tYmUtYS1ndWFyZHMtc3RhdGU";

/**
 * Each page the request cases expect a guard to send to core's /refresh,
 * with the location the guard's tests expect, once per core and page.
 */
const refreshed = new Map(
  [
    ...addressCases
      .filter((asking) => !asking.signedOut)
      .map((asking) => ({
        core: asking.core,
        next: asking.next,
        expected: addressAnswer(asking).location,
      })),
    ...cookieCases
      .filter((asking) => !asking.reads)
      .map((asking) => ({
        core: asking.core,
        next: cookieRequest(asking).page,
        expected: cookieAnswer(asking).location,
      })),
  ].map((page) => [`${page.core} ${page.next}`, page]),
);
const pages = [...refreshed.values()];
const cores = [...new Set(pages.map((page) => page.core))];

/** Where the guard sends the browser to ask core for a token for `next`. */
const refreshUrl = (core: string, next: string) =>
  `${core}/refresh?next=${encodeURIComponent(next)}&state=${state}`;

/** What core answers the browser sent to `url`, holding `session` if any. */
async function ask(app: Hono, url: string, core: string, session?: string) {
  const res = await app.request(url, {
    headers: session === undefined ? {} : withSession(session, core),
  });
  return { status: res.status, location: res.headers.get("location") };
}

/** The token core's redirect to `location` carries, if any. */
function tokenIn(location: string | null): string | undefined {
  if (location === null) return undefined;
  return new URL(location).searchParams.get("token") ?? undefined;
}

/** A guest's session on core: the owner mints a code, a guest signs in. */
async function guestSession(
  app: Hono,
  core: string,
  owner: string,
): Promise<string> {
  const minted = await postJson(
    app,
    "/codes",
    { name: "Grandma" },
    withSession(owner, core),
  );
  const { code } = (await minted.json()) as { code: string };
  const res = await postJson(app, "/login/code", { code });
  return sessionCookieOf(res, core)?.value ?? "";
}

/** A token's claims, by name. */
const claimsOf = (token: string) => Object.keys(decodeJwt(token)).sort();

describe("the fake core, against real core", () => {
  it("has a page to check from each kind of request case", () => {
    expect(cores).toEqual([
      "https://core.robkit.dev",
      "http://core.robkit.localhost:3000",
    ]);
  });

  it.each(pages)(
    "accepts $next from $core, sending the browser back as callbackFor says",
    async ({ core, next, expected }) => {
      const { app } = await freshCore({ origin: core, apps: [example] });
      const owner = await claim(app, core);
      const url = refreshUrl(core, next);

      const signedIn = await ask(app, url, core, owner);
      const signedOut = await ask(app, url, core);

      expect(url).toEqual(expected);
      expect(url).toEqual(refreshLocation(next, { origin: core }));
      expect({ signedIn, signedOut }).toEqual({
        signedIn: {
          status: 302,
          location: callbackFor(next, {
            state,
            token: tokenIn(signedIn.location) ?? "core's token",
          }),
        },
        signedOut: { status: 302, location: callbackFor(next, { state }) },
      });
    },
  );

  it.each(cores)(
    "refuses, from %s, a next on another app, the hub, core, or another scheme or port",
    async (core) => {
      const { app } = await freshCore({ origin: core, apps: [example] });
      const owner = await claim(app, core);
      const page = pages.find((each) => each.core === core)?.next ?? "";
      const changed = (change: (url: URL) => void) => {
        const url = new URL(page);
        change(url);
        return url.href;
      };
      const elsewhere = {
        "an app core doesn't know": page.replace("//example.", "//other."),
        "the hub": page.replace("//example.", "//hub."),
        core: page.replace("//example.", "//core."),
        "another scheme": changed((url) => {
          url.protocol = url.protocol === "https:" ? "http:" : "https:";
        }),
        "another port": changed((url) => {
          url.port = url.port === "" ? "8443" : String(Number(url.port) + 1);
        }),
      };

      const answers = Object.fromEntries(
        await Promise.all(
          Object.entries(elsewhere).map(
            async ([name, next]): Promise<[string, number]> => [
              name,
              (await ask(app, refreshUrl(core, next), core, owner)).status,
            ],
          ),
        ),
      );

      expect(Object.values(elsewhere)).not.toContain(page);
      expect(answers).toEqual({
        "an app core doesn't know": 400,
        "the hub": 400,
        core: 400,
        "another scheme": 400,
        "another port": 400,
      });
    },
  );

  it("serves its key with the fields the fake's has", async () => {
    const { app } = await freshCore();
    const fake = await fakeCore();
    const { port } = new URL(fake.origin);

    const real = (await (
      await app.request("/.well-known/jwks.json")
    ).json()) as JSONWebKeySet;
    const served = (await (
      await fetch(`http://127.0.0.1:${port}/.well-known/jwks.json`, {
        signal: AbortSignal.timeout(10_000),
      })
    ).json()) as JSONWebKeySet;
    const [key] = served.keys;

    expect(real.keys).toEqual([
      {
        ...key,
        x: expect.any(String) as string,
        kid: expect.any(String) as string,
      },
    ]);
    expect(key).toEqual(fake.key.jwk);
  });

  it.each([
    ["the owner", "owner"],
    ["a guest", "guest"],
  ] as const)(
    "mints %s's token for the app with the claims a fake's has",
    async (_, holder) => {
      const core = "https://core.robkit.dev";
      const { app } = await freshCore({ origin: core, apps: [example] });
      const owner = await claim(app, core);
      const session =
        holder === "owner" ? owner : await guestSession(app, core, owner);
      const fake = await fakeCore();
      const next = pages.find((page) => page.core === core)?.next ?? "";
      const jwks = (await (
        await app.request("/.well-known/jwks.json")
      ).json()) as JSONWebKeySet;

      const sent = await ask(app, refreshUrl(core, next), core, session);
      const minted = tokenIn(sent.location);
      if (minted === undefined) {
        throw new Error(`Core minted no token: ${JSON.stringify(sent)}`);
      }
      const faked = await fake.key.token(
        holder === "owner" ? {} : { holder: guest() },
      );

      expect({
        claims: claimsOf(minted),
        aud: decodeJwt(minted).aud,
        kind: decodeJwt(minted).kind,
        header: decodeProtectedHeader(minted),
      }).toEqual({
        claims: claimsOf(faked),
        aud: example,
        kind: holder,
        header: { alg: "EdDSA", kid: jwks.keys[0]?.kid },
      });
      expect(Object.keys(decodeProtectedHeader(faked))).toEqual(["alg", "kid"]);
    },
  );
});
