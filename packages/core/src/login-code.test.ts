import { decodeJwt } from "jose";
import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  claim,
  clockStart,
  freshCore,
  postJson,
  sessionCookieOf,
} from "./test/fresh-app.ts";

const minute = 60_000;
const refused = { error: "That code doesn't work." };

interface Minted {
  id: string;
  code: string;
}

/** Claims the install and mints a code for `name`, as the owner would in admin. */
async function ownerMints(
  app: Hono,
  request: Record<string, unknown> = {},
): Promise<Minted & { owner: string }> {
  const owner = await claim(app);
  const res = await postJson(
    app,
    "/codes",
    { name: "Grandma", ...request },
    { cookie: `robkit_session=${owner}` },
  );
  return { owner, ...((await res.json()) as Minted) };
}

function signInWith(app: Hono, code: unknown) {
  return postJson(app, "/login/code", { code });
}

function sessionOf(app: Hono, sessionToken: string) {
  return Promise.resolve(
    app.request("/session", {
      headers: { cookie: `robkit_session=${sessionToken}` },
    }),
  );
}

describe("POST /login/code", () => {
  it("signs a guest in with a live code, however they type it", async () => {
    const { app } = await freshCore();
    const { id, code } = await ownerMints(app);

    const res = await signInWith(app, ` ${code.toLowerCase()} `);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      state: "signed-in",
      viewer: { kind: "guest", id, name: "Grandma" },
    });
    expect(sessionCookieOf(res)?.attributes).toEqual({
      "Max-Age": "2592000",
      Domain: "robkit.test",
      Path: "/",
      HttpOnly: true,
      Secure: true,
      SameSite: "Lax",
    });
  });

  it("gives the guest a session token naming the code's id, not the code", async () => {
    const { app } = await freshCore();
    const { id, code } = await ownerMints(app);

    const res = await signInWith(app, code);
    const sessionToken = sessionCookieOf(res)?.value ?? "";
    const iat = clockStart.getTime() / 1000;

    expect(decodeJwt(sessionToken)).toEqual({
      sid: expect.stringMatching(/^[0-9a-f-]{36}$/) as string,
      kind: "guest",
      sub: id,
      iat,
      exp: iat + 15 * 60,
    });
  });

  it("keeps the guest signed in, as GET /session tells the hub", async () => {
    const { app } = await freshCore();
    const { id, code } = await ownerMints(app);
    const signIn = await signInWith(app, code);

    const res = await sessionOf(app, sessionCookieOf(signIn)?.value ?? "");

    expect(await res.json()).toEqual({
      state: "signed-in",
      viewer: { kind: "guest", id, name: "Grandma" },
    });
  });

  it("signs a guest in with the test code on a local domain", async () => {
    const { app } = await freshCore({ domain: "robkit.localhost" });
    await claim(app);

    const res = await signInWith(app, "test");

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      state: "signed-in",
      viewer: { kind: "guest", name: "Test" },
    });
  });

  it.each([
    ["an unknown code", "NOPE2"],
    ["something that can't be a code", "ab"],
    ["the test code off a local domain", "TEST"],
  ])("refuses %s with 401", async (_, code) => {
    const { app } = await freshCore();
    await ownerMints(app);

    const res = await signInWith(app, code);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(refused);
    expect(sessionCookieOf(res)).toBeUndefined();
  });

  it("refuses a revoked code with 401", async () => {
    const { app } = await freshCore();
    const { owner, id, code } = await ownerMints(app);
    await postJson(
      app,
      `/codes/${id}/revoke`,
      {},
      { cookie: `robkit_session=${owner}` },
    );

    const res = await signInWith(app, code);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual(refused);
  });

  it("refuses a code once it expires", async () => {
    const { app, advance } = await freshCore();
    const { code } = await ownerMints(app, {
      expiresAt: new Date(clockStart.getTime() + 60 * minute).toISOString(),
    });

    advance(60 * minute - 1);
    const before = await signInWith(app, code);
    advance(1);
    const after = await signInWith(app, code);

    expect([before.status, after.status]).toEqual([200, 401]);
    expect(await after.json()).toEqual(refused);
  });

  it.each([{}, { code: 12345 }, "TEST"])(
    "refuses %j with 400",
    async (body) => {
      const { app } = await freshCore({ domain: "robkit.localhost" });
      await claim(app);

      const res = await postJson(app, "/login/code", body);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Send a code." });
    },
  );

  it("refuses with 409 before anyone has set up the install", async () => {
    const { app } = await freshCore({ domain: "robkit.localhost" });

    const res = await signInWith(app, "TEST");

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "This install has no owner yet. Set it up first.",
    });
  });
});
