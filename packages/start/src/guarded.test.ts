import { conformanceAnswer, fakeCore, owner } from "@internal/test-session";
import { conformanceCases } from "@robkit/guard/conformance";
import { describe, expect, it } from "vitest";
import { guarded, type GuardedOptions } from "./index.ts";

// requestGuard's own tests cover the guard. These cover the Start glue: the
// guard's answer goes out as is, and Start gets the viewer as context.

const page = "http://start.robkit.localhost:3000/notes?x=1";
const serverFn = "http://start.robkit.localhost:3000/_serverFn/abc";
const minute = 60;

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

    const res = await open({ access: asking.rule, core: core.origin }, page, {
      headers: {
        "sec-fetch-mode": "navigate",
        ...(await core.key.cookieFor(asking)),
      },
    });

    const body =
      res.status === 200
        ? ((await res.json()) as { viewer: unknown })
        : undefined;
    expect({
      status: res.status,
      location: res.headers.get("location"),
      viewer: body?.viewer,
    }).toEqual(conformanceAnswer(asking, page, core.origin));
  });

  it("answers a server function call with an expired session with the guard's 401", async () => {
    const core = await fakeCore();

    const res = await open(
      { access: { kind: "owner" }, core: core.origin },
      serverFn,
      {
        method: "POST",
        headers: {
          "sec-fetch-mode": "cors",
          "x-tsr-serverfn": "true",
          cookie: `robkit_session=${await core.key.token(20 * minute)}`,
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

    const res = await open(
      { access: { kind: "owner" }, core: core.origin },
      serverFn,
      {
        method: "POST",
        headers: {
          "sec-fetch-mode": "cors",
          "x-tsr-serverfn": "true",
          cookie: `robkit_session=${await core.key.token()}`,
        },
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewer: owner });
  });
});
