import { describe, expect, it } from "vitest";
import {
  claim,
  freshCore,
  postJson,
  sessionCookieOf,
} from "./test/fresh-app.ts";

const rob = { username: "rob", password: "correct horse battery" };
const wrong = { username: "rob", password: "not the password" };
const minute = 60_000;

describe("POST /login", () => {
  it("signs the owner in", async () => {
    const { app } = await freshCore();
    await claim(app);

    const res = await postJson(app, "/login", rob);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      state: "signed-in",
      profile: {
        kind: "owner",
        id: expect.any(String) as string,
        username: "rob",
      },
    });
    expect(sessionCookieOf(res)?.attributes).toEqual({
      "Max-Age": "2592000",
      Path: "/",
      HttpOnly: true,
      Secure: true,
      SameSite: "Lax",
    });
  });

  it("answers with the same owner that setup made", async () => {
    const { app } = await freshCore();
    const setup = await postJson(app, "/setup", rob);

    const login = await postJson(app, "/login", { ...rob, username: " rob " });

    expect(await login.json()).toEqual(await setup.json());
  });

  it.each([
    ["a wrong password", wrong],
    ["an unknown username", { ...rob, username: "eve" }],
  ])("refuses %s with 401", async (_, body) => {
    const { app } = await freshCore();
    await claim(app);

    const res = await postJson(app, "/login", body);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Wrong username or password." });
    expect(sessionCookieOf(res)).toBeUndefined();
  });

  it("refuses with 409 before anyone has set up the install", async () => {
    const { app } = await freshCore();

    const res = await postJson(app, "/login", rob);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "This install has no owner yet. Set it up first.",
    });
  });

  it.each([
    [{ username: "rob" }, "Send a username and a password."],
    [{ password: rob.password }, "Send a username and a password."],
    ["rob", "Send a JSON object."],
  ])("refuses %j with 400", async (body, error) => {
    const { app } = await freshCore();
    await claim(app);

    const res = await postJson(app, "/login", body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
});

describe("POST /login's rate limit", () => {
  const from = (client: string) => ({ "x-forwarded-for": client });

  async function failFiveTimes(
    app: Parameters<typeof claim>[0],
    client: string,
  ): Promise<number[]> {
    const statuses = [];
    for (let i = 0; i < 5; i++) {
      statuses.push(
        (await postJson(app, "/login", wrong, from(client))).status,
      );
    }
    return statuses;
  }

  it("refuses a sixth attempt in 15 minutes, even with the right password", async () => {
    const { app } = await freshCore();
    await claim(app);

    expect(await failFiveTimes(app, "203.0.113.7")).toEqual([
      401, 401, 401, 401, 401,
    ]);
    const res = await postJson(app, "/login", rob, from("203.0.113.7"));

    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("900");
    expect(await res.json()).toEqual({
      error: "Too many attempts. Try again in 15 minutes.",
    });
    expect(sessionCookieOf(res)).toBeUndefined();
  });

  it("counts down, then lets the client try again", async () => {
    const { app, advance } = await freshCore();
    await claim(app);
    await failFiveTimes(app, "203.0.113.7");

    advance(14 * minute + 30_000);
    const soon = await postJson(app, "/login", rob, from("203.0.113.7"));
    advance(30_000);
    const later = await postJson(app, "/login", rob, from("203.0.113.7"));

    expect(soon.status).toBe(429);
    expect(soon.headers.get("retry-after")).toBe("30");
    expect(await soon.json()).toEqual({
      error: "Too many attempts. Try again in 30 seconds.",
    });
    expect(later.status).toBe(200);
  });

  it("says a wait under a minute in seconds", async () => {
    const { app, advance } = await freshCore();
    await claim(app);
    await failFiveTimes(app, "203.0.113.7");

    advance(15 * minute - 1);
    const res = await postJson(app, "/login", rob, from("203.0.113.7"));

    expect(res.headers.get("retry-after")).toBe("1");
    expect(await res.json()).toEqual({
      error: "Too many attempts. Try again in 1 second.",
    });
  });

  it("forgets failures older than 15 minutes", async () => {
    const { app, advance } = await freshCore();
    await claim(app);
    await postJson(app, "/login", wrong, from("203.0.113.7"));
    advance(10 * minute);
    for (let i = 0; i < 4; i++) {
      await postJson(app, "/login", wrong, from("203.0.113.7"));
    }

    const blocked = await postJson(app, "/login", rob, from("203.0.113.7"));
    advance(5 * minute);
    const allowed = await postJson(app, "/login", rob, from("203.0.113.7"));

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("300");
    expect(allowed.status).toBe(200);
  });

  it("keys on the last X-Forwarded-For entry, the one the proxy added", async () => {
    const { app } = await freshCore();
    await claim(app);
    await failFiveTimes(app, "198.51.100.1, 10.0.0.1");

    const spoofed = await postJson(app, "/login", rob, from("10.0.0.1"));
    const other = await postJson(
      app,
      "/login",
      rob,
      from("198.51.100.1, 10.0.0.2"),
    );

    expect(spoofed.status).toBe(429);
    expect(other.status).toBe(200);
  });

  it("ignores CF-Connecting-IP unless core trusts Cloudflare", async () => {
    const { app } = await freshCore();
    await claim(app);
    const via = (visitor: string) => ({
      "cf-connecting-ip": visitor,
      "x-forwarded-for": "172.18.0.5",
    });
    for (let i = 0; i < 5; i++) {
      await postJson(app, "/login", wrong, via(`198.51.100.${String(i)}`));
    }

    const res = await postJson(app, "/login", rob, via("198.51.100.99"));

    expect(res.status).toBe(429);
  });

  it("treats requests without X-Forwarded-For as one client", async () => {
    const { app } = await freshCore();
    await claim(app);
    for (let i = 0; i < 5; i++) await postJson(app, "/login", wrong);

    const anonymous = await postJson(app, "/login", rob);
    const forwarded = await postJson(app, "/login", rob, from("203.0.113.7"));

    expect(anonymous.status).toBe(429);
    expect(forwarded.status).toBe(200);
  });

  describe("behind a Cloudflare tunnel", () => {
    // The tunnel reaches Traefik from one address, so every visitor's
    // X-Forwarded-For ends the same way. Cloudflare names the visitor.
    const via = (visitor: string) => ({
      "cf-connecting-ip": visitor,
      "x-forwarded-for": `${visitor}, 172.18.0.5`,
    });

    it("counts each visitor's failures on their own", async () => {
      const { app } = await freshCore({ trustedProxy: "cloudflare" });
      await claim(app);
      await failFiveTimesVia(app, via("203.0.113.7"));

      const blocked = await postJson(app, "/login", rob, via("203.0.113.7"));
      const other = await postJson(app, "/login", rob, via("198.51.100.1"));

      expect(blocked.status).toBe(429);
      expect(other.status).toBe(200);
    });

    it("treats requests that didn't come through Cloudflare as one client", async () => {
      const { app } = await freshCore({ trustedProxy: "cloudflare" });
      await claim(app);
      await failFiveTimesVia(app, from("172.18.0.9"));

      const direct = await postJson(app, "/login", rob, from("172.18.0.10"));
      const tunnelled = await postJson(app, "/login", rob, via("203.0.113.7"));

      expect(direct.status).toBe(429);
      expect(tunnelled.status).toBe(200);
    });
  });

  async function failFiveTimesVia(
    app: Parameters<typeof claim>[0],
    headers: Record<string, string>,
  ): Promise<void> {
    for (let i = 0; i < 5; i++) {
      const res = await postJson(app, "/login", wrong, headers);
      expect(res.status).toBe(401);
    }
  }

  it("clears a client's failures when it signs in", async () => {
    const { app } = await freshCore();
    await claim(app);
    for (let i = 0; i < 4; i++) {
      await postJson(app, "/login", wrong, from("203.0.113.7"));
    }
    await postJson(app, "/login", rob, from("203.0.113.7"));

    expect(await failFiveTimes(app, "203.0.113.7")).toEqual([
      401, 401, 401, 401, 401,
    ]);
    expect(
      (await postJson(app, "/login", rob, from("203.0.113.7"))).status,
    ).toBe(429);
  });
});
