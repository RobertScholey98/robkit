import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import {
  createLocalJWKSet,
  decodeJwt,
  jwtVerify,
  type JSONWebKeySet,
} from "jose";
import { describe, expect, it } from "vitest";
import {
  claim,
  clockStart,
  freshCore,
  resigned,
  sessionCookieOf,
} from "./test/fresh-app.ts";

const minute = 60_000;
const back = "https://notes.robkit.test/list?sort=new";
const state = "s".repeat(43);

function refresh(
  app: Hono,
  next: string | undefined,
  sessionToken?: string,
  query = `&state=${state}`,
) {
  const nextQuery =
    next === undefined ? "" : `next=${encodeURIComponent(next)}`;
  return Promise.resolve(
    app.request(`/refresh?${nextQuery}${query}`, {
      headers: sessionToken ? { cookie: `robkit_session=${sessionToken}` } : {},
    }),
  );
}

async function stateOf(app: Hono, sessionToken: string) {
  const res = await app.request("/session", {
    headers: { cookie: `robkit_session=${sessionToken}` },
  });
  return ((await res.json()) as { state: string }).state;
}

/** Where /refresh sent the browser: the app's callback, and what it carries. */
function callbackOf(res: Response) {
  const location = new URL(res.headers.get("location") ?? "");
  const { searchParams } = location;
  return {
    callback: `${location.origin}${location.pathname}`,
    next: searchParams.get("next"),
    state: searchParams.get("state"),
    token: searchParams.get("token"),
  };
}

describe("GET /refresh", () => {
  it("sends the browser to the app's callback with a token minted for that app alone", async () => {
    const { app, advance } = await freshCore();
    const sessionToken = await claim(app);
    const ownerId = decodeJwt(sessionToken).sub;
    advance(16 * minute);

    const res = await refresh(app, back, sessionToken);
    const sent = callbackOf(res);
    const jwks = (await (
      await app.request("/.well-known/jwks.json")
    ).json()) as JSONWebKeySet;
    const { payload } = await jwtVerify(
      sent.token ?? "",
      createLocalJWKSet(jwks),
      {
        audience: "notes",
        currentDate: new Date(clockStart.getTime() + 16 * minute),
      },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect({ ...sent, token: undefined }).toEqual({
      callback: "https://notes.robkit.test/_robkit/session",
      next: back,
      state,
      token: undefined,
    });
    expect(payload).toEqual({
      aud: "notes",
      sub: ownerId,
      kind: "owner",
      iat: 1793534400 + 16 * 60,
      exp: 1793534400 + 31 * 60,
    });
  });

  it("refuses the app's token it minted, at /session and at /refresh", async () => {
    const { app } = await freshCore();
    const sessionToken = await claim(app);
    const { token } = callbackOf(await refresh(app, back, sessionToken));

    const again = await refresh(app, back, token ?? "");

    expect(await stateOf(app, token ?? "")).toBe("signed-out");
    expect(callbackOf(again).token).toBeNull();
    expect(sessionCookieOf(again)?.value).toBe("");
  });

  it("reissues an expired token of core's own while its session lives", async () => {
    const { app, advance } = await freshCore();
    const sessionToken = await claim(app);
    advance(16 * minute);

    const res = await refresh(app, back, sessionToken);
    const fresh = sessionCookieOf(res);

    expect(fresh?.attributes).toEqual({
      "Max-Age": "2592000",
      Path: "/",
      HttpOnly: true,
      Secure: true,
      SameSite: "Lax",
    });
    expect(fresh?.value).not.toBe(sessionToken);
    expect(await stateOf(app, fresh?.value ?? "")).toBe("signed-in");
  });

  it("reissues a token core still thinks live, since the app's clock may run ahead", async () => {
    const { app, advance } = await freshCore();
    const sessionToken = await claim(app);
    advance(14 * minute);

    const res = await refresh(app, back, sessionToken);
    const fresh = sessionCookieOf(res);

    expect(fresh?.attributes["Max-Age"]).toBe("2592000");
    expect(fresh?.value).not.toBe(sessionToken);
    expect(await stateOf(app, fresh?.value ?? "")).toBe("signed-in");
  });

  it("clears the cookie of a revoked session and sends the app no token", async () => {
    const { app, db, advance } = await freshCore();
    const sessionToken = await claim(app);
    await db.execute(sql`update core.sessions set revoked_at = now()`);
    advance(16 * minute);

    const res = await refresh(app, back, sessionToken);

    expect(res.status).toBe(302);
    expect(callbackOf(res)).toEqual({
      callback: "https://notes.robkit.test/_robkit/session",
      next: back,
      state,
      token: null,
    });
    expect(sessionCookieOf(res)).toEqual({
      value: "",
      attributes: {
        "Max-Age": "0",
        Path: "/",
        HttpOnly: true,
        Secure: true,
        SameSite: "Lax",
      },
    });
  });

  it("never renews from an app's token, though core signed it for a live session", async () => {
    const { app, db, advance } = await freshCore();
    const appToken = await resigned(db, await claim(app), { aud: "notes" });
    advance(16 * minute);

    const res = await refresh(app, back, appToken);

    expect(callbackOf(res).token).toBeNull();
    expect(sessionCookieOf(res)?.value).toBe("");
  });

  it("sends a browser without a cookie back with no token, setting no cookie", async () => {
    const { app } = await freshCore();
    await claim(app);

    const res = await refresh(app, back);

    expect(res.status).toBe(302);
    expect(callbackOf(res).token).toBeNull();
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("hands a token over plain http on a local install", async () => {
    const { app } = await freshCore({
      origin: "http://core.robkit.localhost:3000",
    });
    const sessionToken = await claim(app);
    const local = "http://notes.robkit.localhost:3000/";

    const res = await refresh(app, local, sessionToken);

    expect(callbackOf(res)).toMatchObject({
      callback: "http://notes.robkit.localhost:3000/_robkit/session",
      next: local,
    });
    expect(callbackOf(res).token).not.toBeNull();
  });

  it.each([
    ["no next", undefined],
    ["a site outside the install", "https://evil.com/"],
    ["a look-alike domain", "https://robkit.test.evil.com/"],
    ["the bare install domain", "https://robkit.test/"],
    ["a protocol-relative path", "//evil.com/"],
    ["a relative path", "/somewhere"],
    ["a script", "javascript:alert(1)//.robkit.test"],
    ["a page two labels deep", "https://a.notes.robkit.test/"],
    ["plain http on a hosted install", "http://notes.robkit.test/"],
    ["core itself", "https://core.robkit.test/"],
    ["the hub", "https://hub.robkit.test/"],
  ])("refuses %s with 400 and no cookie", async (_, next) => {
    const { app, advance } = await freshCore();
    const sessionToken = await claim(app);
    advance(16 * minute);

    const res = await refresh(app, next, sessionToken);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Send next, a URL on one of this install's apps.",
    });
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});
