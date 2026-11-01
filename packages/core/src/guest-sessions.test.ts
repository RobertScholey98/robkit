import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import {
  claim,
  clockStart,
  freshCore,
  postJson,
  sessionCookieOf,
} from "./test/fresh-app.ts";

const minute = 60_000;
const back = "https://notes.robkit.test/";

/** The owner mints a code, then a guest signs in with it. */
async function guestSignsIn(app: Hono, request: Record<string, unknown> = {}) {
  const owner = await claim(app);
  const minted = await postJson(
    app,
    "/codes",
    { name: "Grandma", ...request },
    { cookie: `robkit_session=${owner}` },
  );
  const { id, code } = (await minted.json()) as { id: string; code: string };
  const signIn = await postJson(app, "/login/code", { code });
  return { owner, id, guest: sessionCookieOf(signIn)?.value ?? "" };
}

async function stateOf(app: Hono, sessionToken: string) {
  const res = await app.request("/session", {
    headers: { cookie: `robkit_session=${sessionToken}` },
  });
  return ((await res.json()) as { state: string }).state;
}

/** What /refresh does with the guest's cookie: a fresh token, or cleared. */
async function refresh(app: Hono, sessionToken: string) {
  const res = await app.request(`/refresh?next=${encodeURIComponent(back)}`, {
    headers: { cookie: `robkit_session=${sessionToken}` },
  });
  const cookie = sessionCookieOf(res);
  return {
    status: res.status,
    location: res.headers.get("location"),
    cookie: cookie?.attributes["Max-Age"] === "0" ? "cleared" : "fresh",
  };
}

describe("a guest's session", () => {
  it("refreshes while the code works", async () => {
    const { app, advance } = await freshCore();
    const { guest } = await guestSignsIn(app);
    advance(16 * minute);

    expect(await refresh(app, guest)).toEqual({
      status: 302,
      location: back,
      cookie: "fresh",
    });
  });

  it("ends at the next refresh once the owner revokes the code", async () => {
    const { app } = await freshCore();
    const { owner, id, guest } = await guestSignsIn(app);

    await postJson(
      app,
      `/codes/${id}/revoke`,
      {},
      { cookie: `robkit_session=${owner}` },
    );

    expect(await stateOf(app, guest)).toBe("signed-out");
    expect(await refresh(app, guest)).toEqual({
      status: 302,
      location: back,
      cookie: "cleared",
    });
  });

  it("ends at the next refresh once the code expires", async () => {
    const { app, advance } = await freshCore();
    const { guest } = await guestSignsIn(app, {
      expiresAt: new Date(clockStart.getTime() + 60 * minute).toISOString(),
    });

    advance(60 * minute - 1);
    const before = await stateOf(app, guest);
    advance(1);

    expect(before).toBe("signed-in");
    expect(await stateOf(app, guest)).toBe("signed-out");
    expect(await refresh(app, guest)).toEqual({
      status: 302,
      location: back,
      cookie: "cleared",
    });
  });

  it("on the test code ends once the install leaves its local domain", async () => {
    const local = await freshCore({ domain: "robkit.localhost" });
    await claim(local.app);
    const signIn = await postJson(local.app, "/login/code", { code: "TEST" });
    const guest = sessionCookieOf(signIn)?.value ?? "";
    const moved = createApp({
      db: local.db,
      domain: "robkit.test",
      now: local.now,
    });

    expect(await stateOf(local.app, guest)).toBe("signed-in");
    expect(await stateOf(moved, guest)).toBe("signed-out");
  });
});
