import { once } from "node:events";
import type { AddressInfo } from "node:net";
import * as builders from "@robkit/guard/testing";
import express from "express";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { GuardedResponse, Viewer } from "./index.ts";
import { guardedAs, guest, nobody, owner } from "./testing.ts";

/**
 * An app behind `guardedAs(viewer)` whose one handler answers its viewer,
 * listening on a loopback port for the test.
 */
async function appAs(viewer: Viewer) {
  let reached = false;
  const app = express();
  app.use(guardedAs(viewer));
  app.use((_req, res: GuardedResponse) => {
    reached = true;
    res.json(res.locals.viewer);
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(async () => {
    server.close();
    await once(server, "close");
  });
  const { port } = server.address() as AddressInfo;
  return {
    ask: (path: string, init?: RequestInit) =>
      fetch(`http://127.0.0.1:${String(port)}${path}`, init),
    reached: () => reached,
  };
}

describe("@robkit/express/testing", () => {
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
    const { ask } = await appAs(viewer);

    const page = await ask("/");
    const post = await ask("/visits", { method: "POST" });

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
    const { ask, reached } = await appAs(owner());

    const res = await ask("/");

    expect({
      status: res.status,
      type: res.headers.get("content-type"),
      body: await res.text(),
      reached: reached(),
    }).toEqual({
      status: 500,
      type: "text/plain; charset=utf-8",
      body: "This app's server uses guardedAs() from @robkit/express/testing, which serves only in a test run: NODE_ENV is test, or Vitest is running and NODE_ENV isn't production. Use guarded() from @robkit/express.",
      reached: false,
    });
  });

  it.each([
    ["NODE_ENV is test, with another test runner", "test", undefined],
    ["Vitest runs with NODE_ENV already set", "development", "true"],
  ])("serves when %s", async (_, nodeEnv, vitest) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("VITEST", vitest);
    const { ask } = await appAs(owner());

    expect((await ask("/")).status).toBe(200);
  });
});
