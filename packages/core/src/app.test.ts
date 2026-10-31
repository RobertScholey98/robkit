import { freePort } from "@internal/test-postgres";
import { provisionDatabase } from "@robkit/dev";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createApp } from "./app.ts";
import { createDatabase, type Database } from "./database.ts";

let db: Database;

beforeAll(async () => {
  db = createDatabase(await provisionDatabase(inject("adminUrl"), "core"));
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
