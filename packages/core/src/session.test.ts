import { sql } from "drizzle-orm";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  claim,
  freshCore,
  postJson,
  sessionCookieOf,
} from "./test/fresh-app.ts";

const minute = 60_000;
const day = 24 * 60 * minute;

function getSession(app: Hono, sessionToken?: string) {
  return Promise.resolve(
    app.request("/session", {
      headers: sessionToken ? { cookie: `robkit_session=${sessionToken}` } : {},
    }),
  );
}

async function setUp(app: Hono) {
  const res = await postJson(app, "/setup", {
    username: "rob",
    password: "correct horse battery",
  });
  const { viewer } = (await res.json()) as { viewer: unknown };
  return { viewer, sessionToken: sessionCookieOf(res)?.value ?? "" };
}

describe("GET /session", () => {
  it("says unclaimed while the install has no owner", async () => {
    const { app } = await freshCore();

    const res = await getSession(app);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "unclaimed" });
  });

  it("says signed-out to a browser without a session cookie", async () => {
    const { app } = await freshCore();
    await claim(app);

    const res = await getSession(app);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "signed-out" });
  });

  it("says signed-in, with the owner as viewer, to the owner's browser", async () => {
    const { app } = await freshCore();
    const { viewer, sessionToken } = await setUp(app);

    const res = await getSession(app, sessionToken);

    expect(await res.json()).toEqual({ state: "signed-in", viewer });
    expect(viewer).toMatchObject({ kind: "owner", username: "rob" });
    expect(sessionCookieOf(res)).toBeUndefined();
  });

  it.each([
    ["garbage", "not-a-token"],
    ["a token with its signature changed", "tampered"],
    ["a token from another install", "foreign"],
  ])("says signed-out to %s", async (_, kind) => {
    const { app } = await freshCore();
    const sessionToken = await claim(app);
    const tokens: Record<string, string> = {
      "not-a-token": "not-a-token",
      tampered: `${sessionToken.slice(0, -4)}AAAA`,
      foreign: await claim((await freshCore()).app),
    };

    const res = await getSession(app, tokens[kind]);

    expect(await res.json()).toEqual({ state: "signed-out" });
  });

  it("says signed-out once the session is revoked", async () => {
    const { app, db } = await freshCore();
    const sessionToken = await claim(app);

    await db.execute(sql`update core.sessions set revoked_at = now()`);
    const res = await getSession(app, sessionToken);

    expect(await res.json()).toEqual({ state: "signed-out" });
  });

  it("keeps the owner signed in for 30 days, then signs them out", async () => {
    const { app, advance } = await freshCore();
    const sessionToken = await claim(app);

    advance(30 * day - minute);
    const lastMinute = await getSession(app, sessionToken);
    advance(minute);
    const after = await getSession(app, sessionToken);

    expect(await lastMinute.json()).toMatchObject({ state: "signed-in" });
    expect(await after.json()).toEqual({ state: "signed-out" });
  });

  it("reissues an expired session token while its session lives", async () => {
    const { app, advance, now } = await freshCore();
    const { viewer, sessionToken } = await setUp(app);

    advance(16 * minute);
    const res = await getSession(app, sessionToken);
    const fresh = sessionCookieOf(res);
    const jwks = (await (
      await app.request("/.well-known/jwks.json")
    ).json()) as JSONWebKeySet;
    const { payload } = await jwtVerify(
      fresh?.value ?? "",
      createLocalJWKSet(jwks),
      { currentDate: now() },
    );
    const old = await jwtVerify(sessionToken, createLocalJWKSet(jwks), {
      currentDate: new Date(0),
    });

    expect(await res.json()).toEqual({ state: "signed-in", viewer });
    expect(fresh?.attributes).toMatchObject({
      "Max-Age": "2592000",
      Domain: "robkit.test",
      HttpOnly: true,
    });
    expect(payload).toEqual({
      ...old.payload,
      iat: 1793534400 + 16 * 60,
      exp: 1793534400 + 31 * 60,
    });
  });
});
