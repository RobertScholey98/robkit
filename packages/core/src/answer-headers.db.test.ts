import { freePort } from "@internal/test-postgres";
import { aCoreOrigin } from "@internal/test-session";
import { describe, expect, it, onTestFinished } from "vitest";
import { createApp } from "./app.ts";
import { createDatabase } from "./database.ts";
import { claim, freshCore, withSession } from "./test/fresh-app.ts";

// Core's pages can't be framed by anyone, and a browser reads each as the
// type it says. Its redirects carry no framing header, so an app that lets
// a framer in can renew its token through /refresh inside the frame.

const hosted = "https://core.robkit.test";
const local = "http://core.robkit.localhost:3000";

const names = [
  "x-frame-options",
  "content-security-policy",
  "x-content-type-options",
  "strict-transport-security",
] as const;

/** Each header that says who may frame an answer and how to read it. */
function headersOf(res: Response): Record<string, string | null> {
  return Object.fromEntries(names.map((name) => [name, res.headers.get(name)]));
}

const page = {
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000",
};

const redirect = {
  "x-frame-options": null,
  "content-security-policy": null,
  "x-content-type-options": "nosniff",
  "strict-transport-security": "max-age=31536000",
};

describe("what core's answers tell the browser", () => {
  it.each([
    ["an answer", "/status", {}],
    ["a 404", "/nowhere", {}],
    ["a refusal", "/refresh", {}],
    [
      "a CORS preflight",
      "/session",
      {
        method: "OPTIONS",
        headers: {
          origin: "https://hub.robkit.test",
          "access-control-request-method": "POST",
        },
      },
    ],
  ])("refuses every framer on %s", async (_, path, init: RequestInit) => {
    const { app } = await freshCore({ apps: ["notes"] });

    const res = await app.request(path, init);

    expect(headersOf(res)).toEqual(page);
  });

  it("refuses every framer on the 500 for an unexpected error", async () => {
    const unreachable = createDatabase(
      `postgres://core:x@127.0.0.1:${String(await freePort())}/robkit`,
    );
    onTestFinished(() => unreachable.$client.end());
    const app = createApp({
      db: unreachable,
      origin: aCoreOrigin(hosted),
      logError: () => undefined,
    });

    const res = await app.request("/.well-known/jwks.json");

    expect([res.status, headersOf(res)]).toEqual([500, page]);
  });

  it("sends nosniff and no framing header on /refresh's redirect back to the app", async () => {
    const { app } = await freshCore({ apps: ["notes"] });
    const token = await claim(app);

    const res = await app.request(
      `/refresh?next=${encodeURIComponent("https://notes.robkit.test/")}&state=${"s".repeat(43)}`,
      { headers: withSession(token) },
    );

    expect([res.status, headersOf(res)]).toEqual([302, redirect]);
  });

  it("sends no HSTS from a local install", async () => {
    const { app } = await freshCore({ apps: ["notes"], origin: local });

    const res = await app.request("/status");

    expect(headersOf(res)).toEqual({
      ...page,
      "strict-transport-security": null,
    });
  });

  it("sends HSTS from a hosted install", async () => {
    const { app } = await freshCore({ origin: hosted });

    const res = await app.request("/status");

    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=31536000",
    );
  });
});
