import {
  answerHeadersOf,
  callbackFor,
  conformanceAnswer,
  fakeCore,
  headerAnswer,
  headerCases,
  headerRequest,
  owner,
  stateIn,
  slug,
  writeAnswer,
  writeCases,
  writeRequest,
} from "@internal/test-session";
import { orThrow, readCoreUrl } from "@robkit/input";
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

  it.each(writeCases)("$name", async (asking) => {
    let reached = false;
    const app = new Hono<GuardedEnv>()
      .use(
        guarded({
          app: example,
          access: { kind: "open" },
          core: orThrow(readCoreUrl({ ROBKIT_CORE_URL: asking.core })),
        }),
      )
      .all("*", (c) => {
        reached = true;
        return c.json(c.var.viewer);
      });
    const { url, ...init } = writeRequest(asking);

    const res = await app.request(url, init);

    expect({ status: res.status, reached }).toEqual(writeAnswer(asking));
  });

  it.each(headerCases)("$name", async (asking) => {
    let reached = false;
    const { url, access, ...init } = headerRequest(asking);
    const app = new Hono<GuardedEnv>()
      .use(
        guarded({
          app: example,
          access,
          core: orThrow(readCoreUrl({ ROBKIT_CORE_URL: asking.core })),
        }),
      )
      .all("*", (c) => {
        reached = true;
        // Response.redirect() makes headers that can't change.
        if (c.req.path === "/moved") {
          return Response.redirect(new URL("/", c.req.url), 302);
        }
        return c.text("the app", 200, {
          "content-security-policy": "default-src 'self'",
        });
      });

    const res = await app.request(url, init);

    expect({
      status: res.status,
      reached,
      headers: answerHeadersOf(res.headers),
    }).toEqual(headerAnswer(asking));
  });

  it("puts the headers on Hono's own 404 and on the 500 for a handler that throws", async () => {
    const app = new Hono<GuardedEnv>()
      .use(
        guarded({
          app: example,
          access: { kind: "open" },
          core: orThrow(
            readCoreUrl({ ROBKIT_CORE_URL: "https://core.robkit.dev" }),
          ),
        }),
      )
      .get("/broken", () => {
        throw new Error("The handler broke.");
      });

    const answers = await Promise.all(
      ["/missing", "/broken"].map(async (path) =>
        app.request(`https://example.robkit.dev${path}`),
      ),
    );

    expect(
      answers.map((res) => [res.status, answerHeadersOf(res.headers)]),
    ).toEqual(
      [404, 500].map((status) => [
        status,
        {
          "x-frame-options": "SAMEORIGIN",
          "x-content-type-options": "nosniff",
          "strict-transport-security": "max-age=31536000",
          "content-security-policy": null,
        },
      ]),
    );
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
