import {
  callbackFor,
  conformanceAnswer,
  fakeCore,
  owner,
  stateIn,
  slug,
} from "@internal/test-session";
import { conformanceCases } from "@robkit/guard/conformance";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { guarded, type GuardedEnv } from "./index.ts";

const example = slug("example");

// requestGuard's own tests cover the guard. These cover the Hono glue: the
// guard's answer goes out as is, and handlers behind it read c.var.viewer.

const navigate = { "sec-fetch-mode": "navigate" };

describe("guarded", () => {
  it.each(conformanceCases)("$name", async (asking) => {
    const core = await fakeCore();
    const app = new Hono<GuardedEnv>()
      .use(guarded({ app: example, access: asking.rule, core: core.origin }))
      .get("*", (c) => c.json(c.var.viewer));

    const res = await app.request(core.page, {
      headers: { ...navigate, ...(await core.cookieFor(asking)) },
    });

    expect({
      status: res.status,
      location: res.headers.get("location"),
      viewer: res.status === 200 ? await res.json() : undefined,
    }).toEqual(conformanceAnswer(asking, core.page, core));
  });

  it("answers a call from the page with the guard's 401", async () => {
    const core = await fakeCore();
    const app = new Hono<GuardedEnv>()
      .use(
        guarded({
          app: example,
          access: { kind: "owner" },
          core: core.origin,
        }),
      )
      .post("*", (c) => c.json(c.var.viewer));

    const res = await app.request(core.page, {
      method: "POST",
      headers: { "sec-fetch-mode": "cors" },
    });

    expect([res.status, res.headers.get("robkit-session")]).toEqual([
      401,
      "login",
    ]);
  });

  it("takes the app's token from core at the guard's callback, whatever routes the app has", async () => {
    const core = await fakeCore();
    const app = new Hono<GuardedEnv>()
      .use(
        guarded({
          app: example,
          access: { kind: "owner" },
          core: core.origin,
        }),
      )
      .get("/notes", (c) => c.json(c.var.viewer));
    const away = await app.request(core.page, { headers: navigate });
    const [state] = away.headers.getSetCookie();

    const back = await app.request(
      callbackFor(core.page, {
        state: stateIn(away.headers.get("location")),
        token: await core.key.token(),
      }),
      { headers: { ...navigate, cookie: state?.split(";")[0] ?? "" } },
    );
    const [session] = back.headers.getSetCookie();
    const res = await app.request(core.page, {
      headers: { ...navigate, cookie: session?.split(";")[0] ?? "" },
    });

    expect([back.status, back.headers.get("location")]).toEqual([
      302,
      core.page,
    ]);
    expect(await res.json()).toEqual(owner);
  });
});
