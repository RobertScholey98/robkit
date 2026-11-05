import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  claim,
  freshCore,
  resigned,
  sessionCookieOf,
} from "./test/fresh-app.ts";

const minute = 60_000;
const back = "https://notes.robkit.test/list?sort=new";

function refresh(app: Hono, next: string | undefined, sessionToken?: string) {
  const query = next === undefined ? "" : `?next=${encodeURIComponent(next)}`;
  return Promise.resolve(
    app.request(`/refresh${query}`, {
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

describe("GET /refresh", () => {
  it("reissues an expired token while its session lives and sends the browser back", async () => {
    const { app, advance } = await freshCore();
    const sessionToken = await claim(app);
    advance(16 * minute);

    const res = await refresh(app, back, sessionToken);
    const fresh = sessionCookieOf(res);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(back);
    expect(res.headers.get("cache-control")).toBe("no-store");
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

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(back);
    expect(fresh?.attributes["Max-Age"]).toBe("2592000");
    expect(fresh?.value).not.toBe(sessionToken);
    expect(await stateOf(app, fresh?.value ?? "")).toBe("signed-in");
  });

  it("clears the cookie of a revoked session and sends the browser back", async () => {
    const { app, db, advance } = await freshCore();
    const sessionToken = await claim(app);
    await db.execute(sql`update core.sessions set revoked_at = now()`);
    advance(16 * minute);

    const res = await refresh(app, back, sessionToken);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(back);
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

    expect(sessionCookieOf(res)?.value).toBe("");
  });

  it("sends a browser without a cookie back without setting one", async () => {
    const { app } = await freshCore();
    await claim(app);

    const res = await refresh(app, back);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(back);
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it.each([
    ["no next", undefined],
    ["a site outside the install", "https://evil.com/"],
    ["a look-alike domain", "https://robkit.test.evil.com/"],
    ["the bare install domain", "https://robkit.test/"],
    ["a protocol-relative path", "//evil.com/"],
    ["a relative path", "/somewhere"],
    ["a script", "javascript:alert(1)//.robkit.test"],
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
