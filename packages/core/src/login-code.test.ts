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
      roles: [],
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

describe("POST /login/code's rate limit", () => {
  const from = (client: string) => ({ "x-forwarded-for": client });

  it("stops a client after ten wrong codes for 15 minutes, even with a live code", async () => {
    const { app, advance } = await freshCore();
    const { code } = await ownerMints(app);
    for (let i = 0; i < 10; i++) {
      const wrong = await postJson(
        app,
        "/login/code",
        { code: "NOPE2" },
        from("203.0.113.7"),
      );
      expect(wrong.status).toBe(401);
    }

    const blocked = await postJson(
      app,
      "/login/code",
      { code },
      from("203.0.113.7"),
    );
    const other = await postJson(
      app,
      "/login/code",
      { code },
      from("198.51.100.1"),
    );
    advance(15 * minute);
    const later = await postJson(
      app,
      "/login/code",
      { code },
      from("203.0.113.7"),
    );

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("900");
    expect(await blocked.json()).toEqual({
      error: "Too many attempts. Try again in 15 minutes.",
    });
    expect([other.status, later.status]).toEqual([200, 200]);
  });

  it("keeps counting after a guest signs in, so one live code buys no more guesses", async () => {
    const { app } = await freshCore();
    const { code } = await ownerMints(app);
    const attempt = (value: string) =>
      postJson(app, "/login/code", { code: value }, from("203.0.113.7"));
    for (let i = 0; i < 9; i++) await attempt("NOPE2");

    const signedIn = await attempt(code);
    const tenthWrong = await attempt("NOPE2");
    const blocked = await attempt(code);

    expect([signedIn.status, tenthWrong.status, blocked.status]).toEqual([
      200, 401, 429,
    ]);
  });

  it("counts apart from the owner's password limit", async () => {
    const { app } = await freshCore();
    await ownerMints(app);
    for (let i = 0; i < 5; i++) {
      await postJson(
        app,
        "/login",
        { username: "rob", password: "not the password" },
        from("203.0.113.7"),
      );
    }

    const res = await postJson(
      app,
      "/login/code",
      { code: "NOPE2" },
      from("203.0.113.7"),
    );

    expect(res.status).toBe(401);
  });
});
