import { freePort } from "@internal/test-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
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
    const app = createApp({ db, domain: "localhost" });

    const res = await app.request("/status");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("answers 503 when the database is unreachable", async () => {
    const unreachable = createDatabase(
      `postgres://core:x@127.0.0.1:${String(await freePort())}/robkit`,
    );
    const app = createApp({ db: unreachable, domain: "localhost" });

    const res = await app.request("/status");
    await unreachable.$client.end();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "unavailable" });
  });
});

describe("CORS", () => {
  const app = () => createApp({ db, domain: "robkit.test" });

  it.each([
    "http://hub.robkit.test:3000",
    "https://hub.robkit.test",
    "https://admin.robkit.test",
  ])("lets %s make credentialed requests", async (origin) => {
    const res = await app().request("/status", { headers: { origin } });

    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

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
    "https://hub.localhost",
    "null",
  ])("gives %s no access", async (origin) => {
    const res = await app().request("/status", { headers: { origin } });

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
