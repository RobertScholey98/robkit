import { sql } from "drizzle-orm";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { describe, expect, it } from "vitest";
import {
  clockStart,
  freshCore,
  postJson,
  sessionCookieOf,
} from "./test/fresh-app.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const rob = { username: "rob", password: "correct horse battery" };

describe("POST /setup", () => {
  it("makes the caller the owner and signs them in", async () => {
    const { app } = await freshCore();

    const res = await postJson(app, "/setup", rob);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      state: "signed-in",
      profile: {
        kind: "owner",
        id: expect.stringMatching(uuid) as string,
        username: "rob",
      },
    });
  });

  it("sets an HttpOnly session cookie on core's host alone, with no Domain", async () => {
    const { app } = await freshCore({ origin: "https://core.robkit.test" });

    const res = await postJson(app, "/setup", rob);

    expect(sessionCookieOf(res)?.attributes).toEqual({
      "Max-Age": "2592000",
      Path: "/",
      HttpOnly: true,
      Secure: true,
      SameSite: "Lax",
    });
  });

  it.each([
    ["http://core.robkit.localhost:3000", undefined],
    ["http://core.localhost:3000", undefined],
    ["https://core.robkit.test", true],
    ["https://core.notlocalhost.example", true],
  ])("on %s, marks the cookie Secure: %s", async (origin, secure) => {
    const { app } = await freshCore({ origin });

    const res = await postJson(app, "/setup", rob);

    expect(sessionCookieOf(res)?.attributes.Secure).toBe(secure);
  });

  it("signs the cookie's session token with the key in the JWKS", async () => {
    const { app } = await freshCore();

    const res = await postJson(app, "/setup", rob);
    const { profile } = (await res.json()) as { profile: { id: string } };
    const jwks = (await (
      await app.request("/.well-known/jwks.json")
    ).json()) as JSONWebKeySet;
    const { payload, protectedHeader } = await jwtVerify(
      sessionCookieOf(res)?.value ?? "",
      createLocalJWKSet(jwks),
      { currentDate: clockStart },
    );

    expect(protectedHeader).toEqual({ alg: "EdDSA", kid: jwks.keys[0]?.kid });
    expect(payload).toEqual({
      sub: profile.id,
      aud: "core",
      sid: expect.stringMatching(uuid) as string,
      kind: "owner",
      iat: 1793534400,
      exp: 1793534400 + 15 * 60,
    });
  });

  it("stores the password hashed, and the username trimmed", async () => {
    const { app, db } = await freshCore();

    await postJson(app, "/setup", { ...rob, username: "  rob  " });

    const rows = await db.execute<{ username: string; hash: string }>(
      sql`select username, password_hash as hash from core.owner`,
    );
    expect(rows.map((row) => row.username)).toEqual(["rob"]);
    expect(rows[0]?.hash).toMatch(/^scrypt\$/);
    expect(rows[0]?.hash).not.toContain(rob.password);
  });

  it.each([
    [
      { username: "", password: rob.password },
      "Pick a username of 1 to 64 characters.",
    ],
    [
      { username: "   ", password: rob.password },
      "Pick a username of 1 to 64 characters.",
    ],
    [
      { username: "r".repeat(65), password: rob.password },
      "Pick a username of 1 to 64 characters.",
    ],
    [
      { username: "rob", password: "elevenchars" },
      "Pick a password of at least 12 characters.",
    ],
    [{ username: "rob" }, "Send a username and a password."],
    [
      { username: 7, password: rob.password },
      "Send a username and a password.",
    ],
  ])("refuses %j with 400", async (body, error) => {
    const { app } = await freshCore();

    const res = await postJson(app, "/setup", body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(sessionCookieOf(res)).toBeUndefined();
  });

  it("accepts a 64-character username and a 12-character password", async () => {
    const { app } = await freshCore();

    const res = await postJson(app, "/setup", {
      username: "r".repeat(64),
      password: "twelve chars",
    });

    expect(res.status).toBe(201);
  });

  it("refuses a second owner with 409", async () => {
    const { app } = await freshCore();
    await postJson(app, "/setup", rob);

    const res = await postJson(app, "/setup", {
      username: "eve",
      password: "another long password",
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "This install already has an owner.",
    });
    expect(sessionCookieOf(res)).toBeUndefined();
  });

  it("lets exactly one of two racing setups win", async () => {
    const { app, db } = await freshCore();

    const replies = await Promise.all([
      postJson(app, "/setup", rob),
      postJson(app, "/setup", { ...rob, username: "eve" }),
    ]);

    expect(replies.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(
      await db.execute(sql`select count(*)::int as count from core.owner`),
    ).toEqual([{ count: 1 }]);
  });
});

describe("POST bodies", () => {
  it.each([undefined, "text/plain", "application/x-www-form-urlencoded"])(
    "refuses content-type %s with 415",
    async (contentType) => {
      const { app } = await freshCore();

      const res = await app.request("/setup", {
        method: "POST",
        headers: contentType ? { "content-type": contentType } : {},
        body: JSON.stringify(rob),
      });

      expect(res.status).toBe(415);
      expect(await res.json()).toEqual({ error: "Send JSON." });
    },
  );

  it("accepts JSON with a charset", async () => {
    const { app } = await freshCore();

    const res = await postJson(app, "/setup", rob, {
      "content-type": "application/json; charset=utf-8",
    });

    expect(res.status).toBe(201);
  });

  it("refuses malformed JSON with 400", async () => {
    const { app } = await freshCore();

    const res = await app.request("/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"username": "rob",',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Send a valid JSON body." });
  });

  it.each([[[rob]], ["rob"], [null], [7]])(
    "refuses JSON that isn't an object, such as %j, with 400",
    async (body) => {
      const { app } = await freshCore();

      const res = await postJson(app, "/setup", body);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Send a JSON object." });
    },
  );

  it("refuses a body over 16 KiB with 413, and takes one just under", async () => {
    const { app } = await freshCore();
    const padded = (size: number) =>
      JSON.stringify({ ...rob, padding: "x".repeat(size) });

    const tooBig = await app.request("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: padded(16 * 1024),
    });
    const fits = await app.request("/setup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: padded(15 * 1024),
    });

    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ error: "Send at most 16 KiB." });
    expect(fits.status).toBe(201);
  });
});
