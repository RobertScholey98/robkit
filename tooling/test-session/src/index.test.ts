import { once } from "node:events";
import { request, type IncomingMessage } from "node:http";
import { conformanceCases } from "@robkit/guard/conformance";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { isProblem, readCoreUrl } from "@robkit/input";
import {
  addressAnswer,
  addressCases,
  addressCookie,
  cookieAnswer,
  cookieCases,
  cookieRequest,
  coreAddressCases,
  aRoleId,
  callbackFor,
  conformanceAnswer,
  fakeCore,
  guest,
  owner,
  readRequestCases,
  refreshLocation,
  sessionCookieOn,
  signedOutCookie,
  signingKey,
  stateIn,
} from "./index.ts";

/** A token's holder and age, as a verifier with core's public key reads it. */
async function read(publicKey: CryptoKey, token: string) {
  // A token that doesn't verify reads as no token.
  const { payload } = await jwtVerify(token, publicKey, {
    currentDate: new Date(0),
  }).catch(() => ({ payload: undefined }));
  if (!payload) return undefined;
  const { sub, kind, roles, sid, aud } = payload;
  const expired = (payload.exp ?? 0) * 1000 < Date.now();
  return {
    kind,
    id: sub,
    ...(roles ? { roles } : {}),
    ...(sid ? { sid } : {}),
    aud,
    expired,
  };
}

/** Fetches `path` from a fake core on its loopback port, as `origin`'s host. */
async function get(origin: string, path: string) {
  const { host, port } = new URL(origin);
  const req = request({ host: "127.0.0.1", port, path, headers: { host } });
  req.end();
  const [res] = (await once(req, "response")) as [IncomingMessage];
  const chunks: Buffer[] = [];
  for await (const chunk of res) chunks.push(chunk as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString()) as unknown;
  return { status: res.statusCode, body };
}

describe("signingKey", () => {
  it("signs the owner's token for the app under test, as core would", async () => {
    const key = await signingKey();

    const seen = await read(key.publicKey, await key.token());

    expect(seen).toEqual({ ...owner, aud: "example", expired: false });
  });

  it("signs a guest's token carrying their roles", async () => {
    const key = await signingKey();

    const token = await key.token({ holder: guest(["family"]) });

    expect(await read(key.publicKey, token)).toEqual({
      kind: "guest",
      id: "code-1",
      roles: ["family"],
      aud: "example",
      expired: false,
    });
  });

  it("signs core's own token, and one with no audience, with the session's id", async () => {
    const key = await signingKey();

    const coreToken = await key.token({ audience: "core" });
    const none = await key.token({ audience: null });

    expect(await read(key.publicKey, coreToken)).toEqual({
      ...owner,
      sid: "session-1",
      aud: "core",
      expired: false,
    });
    expect(await read(key.publicKey, none)).toEqual({
      ...owner,
      sid: "session-1",
      aud: undefined,
      expired: false,
    });
  });

  it("signs a token issued long enough ago to have expired", async () => {
    const key = await signingKey();

    const seen = await read(
      key.publicKey,
      await key.token({ ageSeconds: 20 * 60 }),
    );

    expect(seen?.expired).toBe(true);
  });

  it("signs tokens another key can't vouch for", async () => {
    const [core, forger] = await Promise.all([signingKey(), signingKey()]);

    expect(await read(core.publicKey, await forger.token())).toBeUndefined();
  });

  it("gives each conformance case's visitor the cookie they'd send", async () => {
    const core = await fakeCore();

    const sent = await Promise.all(
      conformanceCases.map(async (asking): Promise<[string, unknown]> => {
        const { cookie } = await core.cookieFor(asking, "notes");
        const value = cookie?.replace(/^robkit_session=/, "");
        const name = [asking.session, asking.otherToken].filter(Boolean);
        if (value === undefined || value.startsWith("signed-out.")) {
          return [name.join(" "), value?.replace(/\d+$/, "<now>")];
        }
        const { kind, aud, exp = 0 } = decodeJwt(value);
        const seen = { kind, aud, expired: exp * 1000 < Date.now() };
        return [name.join(" "), seen];
      }),
    );

    expect(new Map(sent)).toEqual(
      new Map<string, unknown>([
        ["signed-out", "signed-out.<now>"],
        ["expired", { kind: "owner", aud: "notes", expired: true }],
        ["owner", { kind: "owner", aud: "notes", expired: false }],
        ["guest", { kind: "guest", aud: "notes", expired: false }],
        ["unknown", undefined],
        [
          "unknown another-app",
          { kind: "owner", aud: "notnotes", expired: false },
        ],
        ["unknown core", { kind: "owner", aud: "core", expired: false }],
        [
          "unknown no-audience",
          { kind: "owner", aud: undefined, expired: false },
        ],
      ]),
    );
  });

  it("names the session cookie as @robkit/session does: __Host- over https, plain over http", () => {
    expect([
      sessionCookieOn("https://core.robkit.dev"),
      sessionCookieOn("https://core.robkit.localhost:3443"),
      sessionCookieOn("http://core.robkit.localhost:3000"),
    ]).toEqual([
      "__Host-robkit_session",
      "__Host-robkit_session",
      "robkit_session",
    ]);
  });

  it("writes core's word that nobody is signed in, as of now, under the origin's name", () => {
    const now = String(Math.floor(Date.now() / 1000));

    expect([
      signedOutCookie("https://core.robkit.dev"),
      signedOutCookie("http://core.robkit.localhost:3000"),
    ]).toEqual([
      `__Host-robkit_session=signed-out.${now}`,
      `robkit_session=signed-out.${now}`,
    ]);
  });
});

describe("fakeCore", () => {
  it("serves its signing key's public half as core's JWKS", async () => {
    const core = await fakeCore();

    const { status, body } = await get(core.origin, "/.well-known/jwks.json");
    const keys = createLocalJWKSet(body as { keys: [] });
    const { payload } = await jwtVerify(await core.key.token(), keys);

    expect(status).toBe(200);
    expect(payload.sub).toBe("owner-1");
    expect(core.fetched).toEqual([
      `${new URL(core.origin).host} /.well-known/jwks.json`,
    ]);
  });

  it("serves each app's rule from its catalog, and 404 for an app it lacks", async () => {
    const core = await fakeCore();
    core.rules.example = { kind: "roles", roles: [aRoleId("family")] };

    const known = await get(core.origin, "/apps/example/access");
    const unknown = await get(core.origin, "/apps/notes/access");

    expect(known).toEqual({
      status: 200,
      body: { kind: "roles", roles: ["family"] },
    });
    expect(unknown).toEqual({ status: 404, body: { error: "Not found" } });
  });

  it("names a page on the app under test, beside core on its port", async () => {
    const core = await fakeCore();
    const { port } = new URL(core.origin);

    expect([core.hub, core.page]).toEqual([
      `http://hub.robkit.localhost:${port}`,
      `http://example.robkit.localhost:${port}/notes?x=1`,
    ]);
  });

  it("answers every request with the status it's set to fail with", async () => {
    const core = await fakeCore();
    core.rules.example = { kind: "open" };
    core.status = 503;

    const keys = await get(core.origin, "/.well-known/jwks.json");
    const rule = await get(core.origin, "/apps/example/access");

    expect([keys.status, rule.status]).toEqual([503, 503]);
  });
});

describe("conformanceAnswer", () => {
  const page = "http://example.robkit.localhost:3000/notes?x=1";
  const next = encodeURIComponent(page);
  const core = {
    origin: "http://core.robkit.localhost:3000",
    hub: "http://hub.robkit.localhost:3000",
  };
  const answer = (start: string) => {
    const asking = conformanceCases.find((c) => c.name.startsWith(start));
    if (!asking) throw new Error(`No conformance case starts "${start}".`);
    return conformanceAnswer(asking, page, core);
  };

  it("says what each outcome answers a page load with", () => {
    expect({
      nobody: answer("an open app lets a signed-out visitor in"),
      guest: answer("a role-gated app lets in a guest who holds any one"),
      login: answer("an owner-only app sends a signed-out visitor"),
      refresh: answer("an owner-only app refreshes"),
      notFound: answer("a role-gated app answers a guest with another role"),
    }).toEqual({
      nobody: { status: 200, location: null, viewer: { kind: "nobody" } },
      guest: {
        status: 200,
        location: null,
        viewer: guest(["book-club", "friends"]),
      },
      login: {
        status: 302,
        location: `http://hub.robkit.localhost:3000/?next=${next}`,
        viewer: undefined,
      },
      refresh: {
        status: 302,
        location: refreshLocation(page, core),
        viewer: undefined,
      },
      notFound: { status: 404, location: null, viewer: undefined },
    });
  });
});

describe("refreshLocation", () => {
  const page = "http://example.robkit.localhost:3000/notes?x=1";
  const core = { origin: "http://core.robkit.localhost:3000" };
  const refresh = `http://core.robkit.localhost:3000/refresh?next=${encodeURIComponent(page)}`;
  const state = "a".repeat(43);

  it("matches core's refresh back to the page, with a state", () => {
    expect(`${refresh}&state=${state}`).toEqual(refreshLocation(page, core));
    expect(stateIn(`${refresh}&state=${state}`)).toBe(state);
  });

  it.each([refresh, `${refresh}&state=short`, `${refresh}x&state=${state}`])(
    "doesn't match %s",
    (location) => {
      expect(location).not.toEqual(refreshLocation(page, core));
    },
  );
});

describe("callbackFor", () => {
  it("sends the browser to the app's callback with core's token, as core does", () => {
    expect(
      callbackFor("http://example.robkit.localhost:3000/notes?x=1", {
        state: "s",
        token: "t",
      }),
    ).toBe(
      "http://example.robkit.localhost:3000/_robkit/session?next=http%3A%2F%2Fexample.robkit.localhost%3A3000%2Fnotes%3Fx%3D1&state=s&token=t",
    );
  });
});

describe("addressCases", () => {
  const row = {
    name: "a case",
    core: "https://core.robkit.dev",
    target: "/notes",
    headers: { host: "evil.com" },
    next: "https://example.robkit.dev/notes",
  };

  it("reads every address row of request-cases.json", () => {
    expect(addressCases.length).toBeGreaterThan(0);
  });

  it("reads a row, taking a left-out signedOut as false", () => {
    expect(
      readRequestCases({ address: [row], cookies: [], coreAddress: [] }),
    ).toEqual({
      address: [{ ...row, signedOut: false }],
      cookies: [],
      coreAddress: [],
    });
  });

  it.each([
    [
      "isn't an object",
      "cases",
      'request-cases.json must be an object with a "address" list of cases, but it holds "cases".',
    ],
    [
      "has no address list",
      { cookies: [], coreAddress: [] },
      'request-cases.json must be an object with a "address" list of cases, but it holds {"cookies":[],"coreAddress":[]}.',
    ],
    [
      "holds a row that isn't an object",
      { address: ["row"], cookies: [], coreAddress: [] },
      "request-cases.json address[0] must be an object.",
    ],
    [
      "holds a row with a header that isn't a string",
      {
        address: [{ ...row, headers: { host: 1 } }],
        cookies: [],
        coreAddress: [],
      },
      "request-cases.json address[0] needs a name, core, target and next as strings, headers as an object of strings, and signedOut as true, false or left out.",
    ],
    [
      "holds a row whose signedOut isn't true or false",
      { address: [{ ...row, signedOut: "yes" }], cookies: [], coreAddress: [] },
      "request-cases.json address[0] needs a name, core, target and next as strings, headers as an object of strings, and signedOut as true, false or left out.",
    ],
  ])("refuses a file that %s", (_, value, message) => {
    expect(() => readRequestCases(value)).toThrow(message);
  });

  it("sends a browser that holds nothing to core, and a signed-out one to the hub", () => {
    const [holdsNothing, signedOut] = readRequestCases({
      address: [row, { ...row, signedOut: true }],
      cookies: [],
      coreAddress: [],
    }).address;
    if (!holdsNothing || !signedOut) throw new Error("Two rows went in.");

    expect({
      core: [addressCookie(holdsNothing), addressAnswer(holdsNothing)],
      hub: [addressCookie(signedOut), addressAnswer(signedOut)],
    }).toEqual({
      core: [
        {},
        {
          status: 302,
          location: refreshLocation(row.next, { origin: row.core }),
        },
      ],
      hub: [
        { cookie: signedOutCookie(row.core) },
        {
          status: 302,
          location: `https://hub.robkit.dev/?next=${encodeURIComponent(row.next)}`,
        },
      ],
    });
  });
});

describe("cookieCases", () => {
  const row = {
    name: "a case",
    core: "https://core.robkit.dev",
    cookie: "c2a0 5f5f 3d 78",
    now: 1798761600,
    reads: false,
  };
  const read = (cookies: unknown[]) =>
    readRequestCases({ address: [], cookies, coreAddress: [] }).cookies;

  it("reads every cookie row of request-cases.json", () => {
    expect(cookieCases.length).toBeGreaterThan(0);
  });

  it("reads a row's cookie from hex as bytes, ignoring spaces", () => {
    expect(read([row])).toEqual([
      { ...row, cookie: Uint8Array.from([0xc2, 0xa0, 0x5f, 0x5f, 0x3d, 0x78]) },
    ]);
  });

  it.each([
    [
      "has no cookies list",
      { address: [], coreAddress: [] },
      'a "cookies" list of cases',
    ],
    [
      "holds a row that isn't an object",
      { address: [], cookies: [1], coreAddress: [] },
      "cookies[0] must be an object.",
    ],
    ...[
      { cookie: "c2a" },
      { cookie: "zz" },
      { cookie: 12 },
      { now: 1.5 },
      { reads: "no" },
      { name: 1 },
    ].map((change): [string, unknown, string] => [
      `holds a row with ${JSON.stringify(change)}`,
      { address: [], cookies: [{ ...row, ...change }], coreAddress: [] },
      "cookies[0] needs a name and core as strings, cookie as bytes in hex, now as whole seconds, and reads as true or false.",
    ]),
  ])("refuses a file that %s", (_, value, message) => {
    expect(() => readRequestCases(value)).toThrow(message);
  });

  it("hands the cookie on as Node's server does, each byte as a Latin-1 character", () => {
    const [asking] = read([{ ...row, cookie: "c2a0 e28080 41" }]);
    if (!asking) throw new Error("One row went in.");

    expect(cookieRequest(asking)).toEqual({
      page: "https://example.robkit.dev/",
      cookie: "Â âA",
    });
  });

  it("lets a browser whose cookie the guard reads in as nobody, and sends any other to core", () => {
    const [ignored, readIt] = read([row, { ...row, reads: true }]);
    if (!ignored || !readIt) throw new Error("Two rows went in.");

    expect([cookieAnswer(readIt), cookieAnswer(ignored)]).toEqual([
      { status: 200, location: null, viewer: { kind: "nobody" } },
      {
        status: 302,
        location: refreshLocation("https://example.robkit.dev/", {
          origin: "https://core.robkit.dev",
        }),
        viewer: undefined,
      },
    ]);
  });
});

describe("coreAddressCases", () => {
  it.each(coreAddressCases)(
    "readCoreUrl judges $origin as the table does: $accepted",
    ({ origin, accepted }) => {
      const read = readCoreUrl({ ROBKIT_CORE_URL: origin });

      expect(isProblem(read) ? false : read === origin).toBe(accepted);
    },
  );

  it.each([
    [
      "has no coreAddress list",
      { address: [], cookies: [] },
      'a "coreAddress" list',
    ],
    [
      "holds a row whose accepted isn't true or false",
      { address: [], cookies: [], coreAddress: [{ origin: "x", accepted: 1 }] },
      "coreAddress[0] needs an origin as a string and accepted as true or false.",
    ],
  ])("refuses a file that %s", (_, value, message) => {
    expect(() => readRequestCases(value)).toThrow(message);
  });
});
