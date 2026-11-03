import { conformanceAnswer, fakeCore } from "@internal/test-session";
import { conformanceCases } from "@robkit/guard/conformance";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { guarded, type GuardedEnv } from "./index.ts";

// requestGuard's own tests cover the guard. These cover the Hono glue: the
// guard's answer goes out as is, and handlers behind it read c.var.viewer.

const page = "http://example.robkit.localhost:3000/notes?x=1";

describe("guarded", () => {
  it.each(conformanceCases)("$name", async (asking) => {
    const core = await fakeCore();
    const app = new Hono<GuardedEnv>()
      .use(guarded({ access: asking.rule, core: core.origin }))
      .get("*", (c) => c.json(c.var.viewer));

    const res = await app.request(page, {
      headers: {
        "sec-fetch-mode": "navigate",
        ...(await core.key.cookieFor(asking)),
      },
    });

    expect({
      status: res.status,
      location: res.headers.get("location"),
      viewer: res.status === 200 ? await res.json() : undefined,
    }).toEqual(conformanceAnswer(asking, page, core));
  });

  it("answers a call from the page with the guard's 401", async () => {
    const core = await fakeCore();
    const app = new Hono<GuardedEnv>()
      .use(guarded({ access: { kind: "owner" }, core: core.origin }))
      .post("*", (c) => c.json(c.var.viewer));

    const res = await app.request(page, {
      method: "POST",
      headers: { "sec-fetch-mode": "cors" },
    });

    expect([res.status, res.headers.get("robkit-session")]).toEqual([
      401,
      "login",
    ]);
  });
});
