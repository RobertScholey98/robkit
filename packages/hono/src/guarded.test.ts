import { once } from "node:events";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  guest,
  owner,
  signingKey,
  type SigningKey,
} from "@internal/test-session";
import { conformanceCases } from "@robkit/guard/conformance";
import { Hono } from "hono";
import { exportJWK, type CryptoKey } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { guarded, type GuardedEnv, type GuardedOptions } from "./index.ts";

const page = "http://example.robkit.localhost:3000/notes?x=1";
const next = encodeURIComponent(page);
const navigate = { "sec-fetch-mode": "navigate" };
const minute = 60;

let key: SigningKey;

beforeAll(async () => {
  key = await signingKey();
});

function exampleApp(options: Partial<GuardedOptions> = {}) {
  return new Hono<GuardedEnv>()
    .use(
      guarded({
        access: { kind: "owner" },
        core: "http://core.robkit.localhost:3000",
        keys: key.publicKey,
        ...options,
      }),
    )
    .get("*", (c) => c.json(c.var.viewer));
}

describe("guarded", () => {
  it.each(conformanceCases)("$name", async (asking) => {
    const { rule, session, guestRoles, outcome } = asking;
    const app = exampleApp({ access: rule });

    const res = await app.request(page, {
      headers: { ...navigate, ...(await key.cookieFor(asking)) },
    });

    const expected = {
      allow: {
        status: 200,
        location: null,
        body: {
          "signed-out": { kind: "nobody" },
          expired: undefined,
          owner,
          guest: guest(guestRoles),
        }[session],
      },
      login: {
        status: 302,
        location: `http://hub.robkit.localhost:3000/?next=${next}`,
        body: undefined,
      },
      refresh: {
        status: 302,
        location: `http://core.robkit.localhost:3000/refresh?next=${next}`,
        body: undefined,
      },
      "not-found": { status: 404, location: null, body: undefined },
    }[outcome];
    expect({
      status: res.status,
      location: res.headers.get("location"),
      body: res.status === 200 ? await res.json() : undefined,
    }).toEqual(expected);
  });

  it("treats a token core didn't sign as no token", async () => {
    const forger = await signingKey();

    const res = await exampleApp().request(page, {
      headers: {
        ...navigate,
        cookie: `robkit_session=${await forger.token()}`,
      },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `http://hub.robkit.localhost:3000/?next=${next}`,
    );
  });

  it("keeps the public scheme the proxy saw", async () => {
    const res = await exampleApp({ core: "https://core.example.com" }).request(
      "http://notes.example.com/",
      { headers: { ...navigate, "x-forwarded-proto": "https" } },
    );

    expect(res.headers.get("location")).toBe(
      `https://hub.example.com/?next=${encodeURIComponent("https://notes.example.com/")}`,
    );
  });

  it("answers a fetch from the page with 401 and where to go, not a redirect", async () => {
    const app = exampleApp();

    const loggedOut = await app.request(page, {
      headers: { "sec-fetch-mode": "cors" },
    });
    const expired = await app.request(page, {
      method: "POST",
      headers: { cookie: `robkit_session=${await key.token(20 * minute)}` },
    });

    expect(loggedOut.status).toBe(401);
    expect(await loggedOut.json()).toEqual({
      error: "Sign in to use this app.",
      location: `http://hub.robkit.localhost:3000/?next=${next}`,
    });
    expect(expired.status).toBe(401);
    expect(await expired.json()).toEqual({
      error: "Your session needs refreshing.",
      location: `http://core.robkit.localhost:3000/refresh?next=${next}`,
    });
  });

  it("marks its 401 so the page can tell it from the app's own", async () => {
    const app = exampleApp();

    const loggedOut = await app.request(page, {
      headers: { "sec-fetch-mode": "cors" },
    });
    const expired = await app.request(page, {
      method: "POST",
      headers: { cookie: `robkit_session=${await key.token(20 * minute)}` },
    });

    expect([
      loggedOut.headers.get("robkit-session"),
      expired.headers.get("robkit-session"),
    ]).toEqual(["login", "refresh"]);
  });
});

describe("guarded, without fetch metadata", () => {
  it("answers a server's JSON request with 401, not a redirect", async () => {
    const res = await exampleApp().request(page, {
      headers: { accept: "application/json" },
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Sign in to use this app.",
      location: `http://hub.robkit.localhost:3000/?next=${next}`,
    });
  });

  it("redirects a page load from a browser that sends no metadata", async () => {
    const res = await exampleApp().request(page, {
      headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `http://hub.robkit.localhost:3000/?next=${next}`,
    );
  });
});

describe("guarded, with core's keys", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(async (server) => {
        server.close();
        await once(server, "close");
      }),
    );
  });

  /** A JWKS endpoint on a loopback port that serves `key`'s public half. */
  async function jwksServer(key: CryptoKey) {
    const jwk = { ...(await exportJWK(key)), kid: "key-1", alg: "EdDSA" };
    const fetched: string[] = [];
    const answer = { status: 200 };
    const server = createServer((req, res) => {
      fetched.push(`${String(req.headers.host)} ${String(req.url)}`);
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return {
      port: String((server.address() as AddressInfo).port),
      fetched,
      answer,
    };
  }

  function appBehind(core: string) {
    return new Hono<GuardedEnv>()
      .use(guarded({ access: { kind: "owner" }, core }))
      .get("*", (c) => c.json(c.var.viewer));
  }

  it("fetches core's key once, not on every request", async () => {
    const core = await jwksServer(key.publicKey);
    const app = appBehind(`http://core.robkit.localhost:${core.port}`);

    const viewers = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.request("http://example.robkit.localhost:3000/", {
        headers: { ...navigate, cookie: `robkit_session=${await key.token()}` },
      });
      viewers.push(await res.json());
    }

    expect(viewers).toEqual([
      { kind: "owner", id: "owner-1" },
      { kind: "owner", id: "owner-1" },
      { kind: "owner", id: "owner-1" },
    ]);
    expect(core.fetched).toEqual([
      `core.robkit.localhost:${core.port} /.well-known/jwks.json`,
    ]);
  });

  it("checks tokens against the configured core, whatever port the Host names", async () => {
    const core = await jwksServer(key.publicKey);
    const forger = await signingKey();
    const attacker = await jwksServer(forger.publicKey);
    const app = appBehind(`http://core.robkit.localhost:${core.port}`);

    const res = await app.request(
      `http://example.robkit.localhost:${attacker.port}/`,
      {
        headers: {
          ...navigate,
          cookie: `robkit_session=${await forger.token()}`,
        },
      },
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `http://hub.robkit.localhost:${core.port}/?next=${encodeURIComponent(`http://example.robkit.localhost:${attacker.port}/`)}`,
    );
    expect(attacker.fetched).toEqual([]);
    expect(core.fetched).toEqual([
      `core.robkit.localhost:${core.port} /.well-known/jwks.json`,
    ]);
  });

  it("answers 503 when it can't fetch core's key, not a login redirect", async () => {
    const core = await jwksServer(key.publicKey);
    core.answer.status = 503;
    const app = appBehind(`http://core.robkit.localhost:${core.port}`);

    const res = await app.request("http://example.robkit.localhost:3000/", {
      headers: { ...navigate, cookie: `robkit_session=${await key.token()}` },
    });

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Can't reach core to check your session.");
  });

  it("keeps letting the owner in on a cached key once core stops answering", async () => {
    const core = await jwksServer(key.publicKey);
    const app = appBehind(`http://core.robkit.localhost:${core.port}`);
    const open = async () =>
      app.request("http://example.robkit.localhost:3000/", {
        headers: { ...navigate, cookie: `robkit_session=${await key.token()}` },
      });
    const first = await open();
    core.answer.status = 503;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60 * 60_000);
    try {
      const later = await open();

      expect([first.status, later.status]).toEqual([200, 200]);
      expect(await later.json()).toEqual({ kind: "owner", id: "owner-1" });
      expect(core.fetched).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a core origin that isn't core.<domain>", () => {
    expect(() =>
      guarded({ access: { kind: "owner" }, core: "http://localhost:3000" }),
    ).toThrow(
      "core must be core's public origin, such as http://core.robkit.localhost:3000, not http://localhost:3000",
    );
  });
});

describe("guarded, with its rule in core", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(async (server) => {
        server.close();
        await once(server, "close");
      }),
    );
  });

  /** Core's access endpoint on a loopback port, answering with `rule`. */
  async function coreWithRule(rule: unknown) {
    const answer = { status: 200, rule };
    const fetched: string[] = [];
    const server = createServer((req, res) => {
      fetched.push(String(req.url));
      res.writeHead(answer.status, { "content-type": "application/json" });
      res.end(JSON.stringify(answer.rule));
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = String((server.address() as AddressInfo).port);
    return { origin: `http://core.robkit.localhost:${port}`, answer, fetched };
  }

  function appBehind(core: string) {
    return new Hono<GuardedEnv>()
      .use(guarded({ app: "example", core, keys: key.publicKey }))
      .get("*", (c) => c.json(c.var.viewer));
  }

  async function asGuest(app: Hono<GuardedEnv>, roles: string[]) {
    return app.request(page, {
      headers: {
        ...navigate,
        cookie: `robkit_session=${await key.token(0, guest(roles))}`,
      },
    });
  }

  it("lets in only the guests holding a role core gates the app to", async () => {
    const core = await coreWithRule({ kind: "roles", roles: ["family"] });
    const app = appBehind(core.origin);

    const family = await asGuest(app, ["family"]);
    const friends = await asGuest(app, ["friends"]);

    expect([family.status, friends.status]).toEqual([200, 404]);
    expect(await family.json()).toEqual(guest(["family"]));
    expect(core.fetched).toEqual(["/apps/example/access"]);
  });

  it("answers 503 when it can't load its rule, not a 404", async () => {
    const core = await coreWithRule({ error: "Not found" });
    core.answer.status = 404;
    const app = appBehind(core.origin);

    const res = await asGuest(app, ["family"]);

    expect(res.status).toBe(503);
    expect(await res.text()).toBe(
      "Can't reach core to check who may open this app.",
    );
  });
});
