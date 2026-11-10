import {
  answerHeadersOf,
  callbackFor,
  conformanceAnswer,
  fakeCore,
  headerAnswer,
  headerCases,
  headerRequest,
  owner,
  type FakeCore,
  stateIn,
  slug,
  writeAnswer,
  writeCases,
  writeRequest,
} from "@internal/test-session";
import { orThrow, readCoreUrl } from "@robkit/input";
import { conformanceCases } from "@robkit/guard/conformance";
import { describe, expect, it } from "vitest";
import { guarded, type GuardedOptions } from "./index.ts";

// requestGuard's own tests cover the guard. These cover the Start glue: the
// guard's answer goes out as is, and Start gets the viewer as context.

const navigate = { "sec-fetch-mode": "navigate" };
const minute = 60;

/** `path` on the app the tests guard, beside `core` on its port. */
function on(core: FakeCore, path = "/notes?x=1"): string {
  return new URL(
    path,
    `http://start.robkit.localhost:${new URL(core.origin).port}`,
  ).href;
}

/**
 * Asks the guarded entry for `url`. Start behind it answers with the context
 * it would hand the route or server function.
 */
function open(options: GuardedOptions, url: string, init: RequestInit = {}) {
  const start = {
    fetch: (_request: Request, opts?: { context?: object }) =>
      Response.json(opts?.context ?? {}),
  };
  return guarded(start, options).fetch(new Request(url, init));
}

describe("guarded", () => {
  it.each(conformanceCases)("$name", async (asking) => {
    const core = await fakeCore();
    const page = on(core);

    const res = await open(
      { app: slug("start"), access: asking.rule, core: core.origin },
      page,
      {
        headers: {
          ...navigate,
          ...(await core.cookieFor(asking, "start")),
        },
      },
    );

    const body =
      res.status === 200
        ? ((await res.json()) as { viewer: unknown })
        : undefined;
    expect({
      status: res.status,
      location: res.headers.get("location"),
      viewer: body?.viewer,
    }).toEqual(conformanceAnswer(asking, page, core));
  });

  it.each(writeCases)("$name", async (asking) => {
    let reached = false;
    const start = {
      fetch: () => {
        reached = true;
        return Response.json({});
      },
    };
    const entry = guarded(start, {
      app: slug("example"),
      access: { kind: "open" },
      core: orThrow(readCoreUrl({ ROBKIT_CORE_URL: asking.core })),
    });
    const { url, ...init } = writeRequest(asking);

    const res = await entry.fetch(new Request(url, init));

    expect({ status: res.status, reached }).toEqual(writeAnswer(asking));
  });

  it.each(headerCases)("$name", async (asking) => {
    let reached = false;
    const { url, access, ...init } = headerRequest(asking);
    const start = {
      fetch: (request: Request) => {
        reached = true;
        // Response.redirect() makes headers that can't change.
        if (new URL(request.url).pathname === "/moved") {
          return Response.redirect(new URL("/", request.url), 302);
        }
        return new Response("the app", {
          headers: { "content-security-policy": "default-src 'self'" },
        });
      },
    };
    const entry = guarded(start, {
      app: slug("example"),
      access,
      core: orThrow(readCoreUrl({ ROBKIT_CORE_URL: asking.core })),
    });

    const res = await entry.fetch(new Request(url, init));

    expect({
      status: res.status,
      reached,
      headers: answerHeadersOf(res.headers),
    }).toEqual(headerAnswer(asking));
  });

  it("answers a server function call with an expired session with the guard's 401", async () => {
    const core = await fakeCore();
    const token = await core.key.token({
      ageSeconds: 20 * minute,
      audience: "start",
    });

    const res = await open(
      { app: slug("start"), access: { kind: "owner" }, core: core.origin },
      on(core, "/_serverFn/abc"),
      {
        method: "POST",
        headers: {
          "sec-fetch-mode": "cors",
          "x-tsr-serverfn": "true",
          cookie: `robkit_session=${token}`,
        },
      },
    );

    expect([res.status, res.headers.get("robkit-session")]).toEqual([
      401,
      "refresh",
    ]);
  });

  it("hands a server function call the viewer as context", async () => {
    const core = await fakeCore();
    const token = await core.key.token({ audience: "start" });

    const res = await open(
      { app: slug("start"), access: { kind: "owner" }, core: core.origin },
      on(core, "/_serverFn/abc"),
      {
        method: "POST",
        headers: {
          "sec-fetch-mode": "cors",
          "x-tsr-serverfn": "true",
          cookie: `robkit_session=${token}`,
        },
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewer: owner });
  });

  it("takes the app's token from core at the guard's callback, before Start sees it", async () => {
    const core = await fakeCore();
    const options = {
      app: slug("start"),
      access: { kind: "owner" },
      core: core.origin,
    } as const;
    const page = on(core);
    const away = await open(options, page, { headers: navigate });
    const [state] = away.headers.getSetCookie();

    const back = await open(
      options,
      callbackFor(page, {
        state: stateIn(away.headers.get("location")),
        token: await core.key.token({ audience: "start" }),
      }),
      { headers: { ...navigate, cookie: state?.split(";")[0] ?? "" } },
    );
    const [session] = back.headers.getSetCookie();
    const res = await open(options, page, {
      headers: { ...navigate, cookie: session?.split(";")[0] ?? "" },
    });

    expect([back.status, back.headers.get("location")]).toEqual([302, page]);
    expect(await res.json()).toEqual({ viewer: owner });
  });
});
