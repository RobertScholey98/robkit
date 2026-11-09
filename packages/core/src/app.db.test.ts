import { aCoreOrigin } from "@internal/test-session";
import { freePort } from "@internal/test-postgres";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  inject,
  it,
  onTestFinished,
  vi,
} from "vitest";
import { createApp } from "./app.ts";
import { createDatabase, type Database } from "./database.ts";

let db: Database;

beforeAll(() => {
  db = createDatabase(inject("databaseUrl"));
});

afterAll(async () => {
  await db.$client.end();
});

describe("GET /status", () => {
  it("answers ok once the database answers", async () => {
    const app = createApp({
      db,
      origin: aCoreOrigin("http://core.localhost:3000"),
    });

    const res = await app.request("/status");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("answers 503 when the database is unreachable, and logs why", async () => {
    const unreachable = createDatabase(
      `postgres://core:x@127.0.0.1:${String(await freePort())}/robkit`,
    );
    const logged: [string, unknown][] = [];
    const app = createApp({
      db: unreachable,
      origin: aCoreOrigin("http://core.localhost:3000"),
      logError: (message, cause) => logged.push([message, cause]),
    });

    const res = await app.request("/status");
    await unreachable.$client.end();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unavailable" });
    expect(logged.map(([message]) => message)).toEqual([
      "GET /status: the database is unreachable. Check DATABASE_URL and that Postgres is running.",
    ]);
    expect(logged[0]?.[1]).toBeInstanceOf(Error);
  });
});

describe("an unexpected error", () => {
  it("is logged with its route, cause and a request id, and answered with a generic JSON error carrying the id", async () => {
    const unreachable = createDatabase(
      `postgres://core:x@127.0.0.1:${String(await freePort())}/robkit`,
    );
    const logged: [string, unknown][] = [];
    const app = createApp({
      db: unreachable,
      origin: aCoreOrigin("http://core.localhost:3000"),
      logError: (message, cause) => logged.push([message, cause]),
    });

    const res = await app.request("/.well-known/jwks.json");
    await unreachable.$client.end();

    expect(res.status).toBe(500);
    const id = res.headers.get("x-request-id") ?? "";
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await res.json()).toEqual({
      error: `Core hit an unexpected error. Look for request ${id} in core's log to see what went wrong.`,
      requestId: id,
    });
    expect(logged.map(([message]) => message)).toEqual([
      `GET /.well-known/jwks.json failed (request ${id}).`,
    ]);
    expect(logged[0]?.[1]).toBeInstanceOf(Error);
  });

  it("gets a new request id each time", async () => {
    const unreachable = createDatabase(
      `postgres://core:x@127.0.0.1:${String(await freePort())}/robkit`,
    );
    const app = createApp({
      db: unreachable,
      origin: aCoreOrigin("http://core.localhost:3000"),
      logError: () => undefined,
    });

    const first = await app.request("/.well-known/jwks.json");
    const second = await app.request("/.well-known/jwks.json");
    await unreachable.$client.end();

    expect(first.headers.get("x-request-id")).not.toBe(
      second.headers.get("x-request-id"),
    );
  });

  it("goes to console.error when nothing else is set, the message then the cause", async () => {
    const unreachable = createDatabase(
      `postgres://core:x@127.0.0.1:${String(await freePort())}/robkit`,
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    onTestFinished(() => {
      log.mockRestore();
    });
    const app = createApp({
      db: unreachable,
      origin: aCoreOrigin("http://core.localhost:3000"),
    });

    await app.request("/.well-known/jwks.json");
    await unreachable.$client.end();

    expect(log.mock.calls).toEqual([
      [
        expect.stringMatching(
          /^GET \/\.well-known\/jwks\.json failed \(request [0-9a-f-]{36}\)\.$/,
        ),
      ],
      [expect.any(Error)],
    ]);
  });
});

describe("CORS", () => {
  const hosted = "https://core.robkit.test";
  const local = "http://core.robkit.localhost:3000";
  const app = (origin = hosted) =>
    createApp({ db, origin: aCoreOrigin(origin) });

  it.each([
    ["https://hub.robkit.test", hosted],
    ["https://admin.robkit.test", hosted],
    ["http://hub.robkit.localhost:3000", local],
    ["http://admin.robkit.localhost:3000", local],
  ])("lets %s make credentialed requests to %s", async (origin, core) => {
    const res = await app(core).request("/status", { headers: { origin } });

    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it.each([
    ["http://hub.robkit.test", hosted],
    ["http://admin.robkit.test", hosted],
    ["http://hub.robkit.test:3000", hosted],
    ["https://admin.robkit.test:8443", hosted],
    ["http://hub.robkit.localhost", local],
    ["http://admin.robkit.localhost:3001", local],
    ["https://hub.robkit.localhost:3000", local],
  ])(
    "gives %s, the right host on the wrong protocol or port, no access to %s",
    async (origin, core) => {
      const res = await app(core).request("/status", { headers: { origin } });

      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    },
  );

  it("answers a preflight from the hub", async () => {
    const res = await app().request("/status", {
      method: "OPTIONS",
      headers: {
        origin: "https://hub.robkit.test",
        "access-control-request-method": "POST",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://hub.robkit.test",
    );
  });

  it.each([
    "https://notes.robkit.test",
    "https://robkit.test",
    "https://hub.robkit.test.evil.example",
    "https://evilhub.robkit.test",
    "https://core.robkit.test",
    "https://hub.localhost",
    "not a url",
    "null",
  ])("gives %s no access", async (origin) => {
    const res = await app().request("/status", { headers: { origin } });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
