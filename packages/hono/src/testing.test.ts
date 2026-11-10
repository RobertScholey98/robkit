import * as builders from "@robkit/guard/testing";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GuardedEnv, Viewer } from "./index.ts";
import { guardedAs, guest, nobody, owner } from "./testing.ts";

/** An app behind `guardedAs(viewer)` whose one route answers its viewer. */
function appAs(viewer: Viewer) {
  let reached = false;
  const app = new Hono<GuardedEnv>().use(guardedAs(viewer)).all("*", (c) => {
    reached = true;
    return c.json(c.var.viewer);
  });
  return { app, reached: () => reached };
}

describe("@robkit/hono/testing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gives @robkit/guard's builders", () => {
    expect([owner, guest, nobody]).toEqual([
      builders.owner,
      builders.guest,
      builders.nobody,
    ]);
  });

  it.each([
    ["the owner", owner()],
    ["a guest with a role", guest({ roles: ["family"] })],
    ["nobody", nobody()],
  ])("serves every request as %s", async (_, viewer) => {
    const { app } = appAs(viewer);

    const page = await app.request("/");
    const post = await app.request("/visits", { method: "POST" });

    expect([page.status, await page.json(), post.status]).toEqual([
      200,
      viewer,
      200,
    ]);
  });

  // A server that isn't a test run: an image, pnpm dev, or one started by
  // hand. A copy of guardedAs() left in any of them opens nothing.
  it.each([
    ["NODE_ENV is production", "production", undefined],
    ["NODE_ENV is production, under Vitest", "production", "true"],
    ["NODE_ENV is development", "development", undefined],
    ["neither NODE_ENV nor VITEST is set", undefined, undefined],
  ])("refuses every request when %s", async (_, nodeEnv, vitest) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("VITEST", vitest);
    const { app, reached } = appAs(owner());

    const res = await app.request("/");

    expect({
      status: res.status,
      type: res.headers.get("content-type"),
      body: await res.text(),
      reached: reached(),
    }).toEqual({
      status: 500,
      type: "text/plain; charset=UTF-8",
      body: "This app's server uses guardedAs() from @robkit/hono/testing, which serves only in a test run: NODE_ENV is test, or Vitest is running and NODE_ENV isn't production. Use guarded() from @robkit/hono.",
      reached: false,
    });
  });

  it.each([
    ["NODE_ENV is test, with another test runner", "test", undefined],
    ["Vitest runs with NODE_ENV already set", "development", "true"],
  ])("serves when %s", async (_, nodeEnv, vitest) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("VITEST", vitest);
    const { app } = appAs(owner());

    expect((await app.request("/")).status).toBe(200);
  });
});
