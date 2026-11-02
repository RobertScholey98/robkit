import {
  guest,
  owner,
  signingKey,
  type SigningKey,
} from "@internal/test-session";
import { conformanceCases } from "@robkit/guard/conformance";
import { beforeAll, describe, expect, it } from "vitest";
import { guarded, type GuardedOptions } from "./index.ts";

const page = "http://start.robkit.localhost:3000/notes?x=1";
const next = encodeURIComponent(page);
const navigate = { "sec-fetch-mode": "navigate" };
const minute = 60;

let key: SigningKey;

beforeAll(async () => {
  key = await signingKey();
});

/**
 * Asks the guarded entry for `url`. Start behind it answers with the context
 * it would hand the route or server function.
 */
async function open(
  options: Partial<GuardedOptions>,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const start = {
    fetch: (_request: Request, opts?: { context?: object }) =>
      Response.json(opts?.context ?? {}),
  };
  const entry = guarded(start, {
    access: { kind: "owner" },
    core: "http://core.robkit.localhost:3000",
    keys: key.publicKey,
    ...options,
  });
  return entry.fetch(new Request(url, init));
}

describe("guarded", () => {
  it.each(conformanceCases)("$name", async (asking) => {
    const { rule, session, guestRoles, outcome } = asking;

    const res = await open({ access: rule }, page, {
      headers: { ...navigate, ...(await key.cookieFor(asking)) },
    });

    const expected = {
      allow: {
        status: 200,
        location: null,
        body: {
          viewer: {
            "signed-out": { kind: "nobody" },
            expired: undefined,
            owner,
            guest: guest(guestRoles),
          }[session],
        },
      },
      login: {
        status: 302,
        location: `http://hub.robkit.localhost:3000/?next=${next}`,
        body: undefined,
      },
      refresh: {
        status: 302,
        location: `http://core.robkit.localhost:3000/refresh?next=${next}`,
        body: undefined,
      },
      "not-found": { status: 404, location: null, body: undefined },
    }[outcome];
    expect({
      status: res.status,
      location: res.headers.get("location"),
      body: res.status === 200 ? await res.json() : undefined,
    }).toEqual(expected);
  });

  it("answers a server function call with an expired session with 401 and where to refresh", async () => {
    const call = "http://start.robkit.localhost:3000/_serverFn/abc";

    const res = await open({}, call, {
      method: "POST",
      headers: {
        "sec-fetch-mode": "cors",
        "x-tsr-serverfn": "true",
        cookie: `robkit_session=${await key.token(20 * minute)}`,
      },
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("robkit-session")).toBe("refresh");
    expect(await res.json()).toEqual({
      error: "Your session needs refreshing.",
      location: `http://core.robkit.localhost:3000/refresh?next=${encodeURIComponent(call)}`,
    });
  });

  it("hands a server function call the viewer as context", async () => {
    const res = await open(
      {},
      "http://start.robkit.localhost:3000/_serverFn/abc",
      {
        method: "POST",
        headers: {
          "sec-fetch-mode": "cors",
          "x-tsr-serverfn": "true",
          cookie: `robkit_session=${await key.token()}`,
        },
      },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewer: owner });
  });
});
