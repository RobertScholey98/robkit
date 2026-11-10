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
  formPostAnswer,
  formPostCases,
  formPostRequest,
  answerHeadersOf,
  headerAnswer,
  headerCases,
  headerRequest,
  linksIn,
  writeAnswer,
  writeCases,
  writeRequest,
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

  it("finds no state in a location that has none", () => {
    expect(stateIn(refresh)).toBe("");
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

  it("sends no token when core has none to give", () => {
    expect(
      callbackFor("http://example.robkit.localhost:3000/", { state: "s" }),
    ).toBe(
      "http://example.robkit.localhost:3000/_robkit/session?next=http%3A%2F%2Fexample.robkit.localhost%3A3000%2F&state=s",
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
      readRequestCases({
        address: [row],
        cookies: [],
        coreAddress: [],
        writes: [],
        formPost: [],
        headers: [],
      }),
    ).toEqual({
      address: [{ ...row, signedOut: false }],
      cookies: [],
      coreAddress: [],
      writes: [],
      formPost: [],
      headers: [],
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
      { cookies: [], coreAddress: [], writes: [], formPost: [] },
      'request-cases.json must be an object with a "address" list of cases, but it holds {"cookies":[],"coreAddress":[],"writes":[],"formPost":[]}.',
    ],
    [
      "holds a row that isn't an object",
      {
        address: ["row"],
        cookies: [],
        coreAddress: [],
        writes: [],
        formPost: [],
      },
      "request-cases.json address[0] must be an object.",
    ],
    [
      "holds a row with a header that isn't a string",
      {
        address: [{ ...row, headers: { host: 1 } }],
        cookies: [],
        coreAddress: [],
        writes: [],
        formPost: [],
      },
      "request-cases.json address[0] needs a name, core, target and next as strings, headers as an object of strings, and signedOut as true, false or left out.",
    ],
    [
      "holds a row whose signedOut isn't true or false",
      {
        address: [{ ...row, signedOut: "yes" }],
        cookies: [],
        coreAddress: [],
        writes: [],
        formPost: [],
      },
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
      writes: [],
      formPost: [],
      headers: [],
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
    readRequestCases({
      address: [],
      cookies,
      coreAddress: [],
      writes: [],
      formPost: [],
      headers: [],
    }).cookies;

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
      { address: [], coreAddress: [], writes: [], formPost: [] },
      'a "cookies" list of cases',
    ],
    [
      "holds a row that isn't an object",
      { address: [], cookies: [1], coreAddress: [], writes: [], formPost: [] },
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
      {
        address: [],
        cookies: [{ ...row, ...change }],
        coreAddress: [],
        writes: [],
        formPost: [],
      },
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
      { address: [], cookies: [], writes: [], formPost: [] },
      'a "coreAddress" list',
    ],
    [
      "holds a row whose accepted isn't true or false",
      {
        address: [],
        cookies: [],
        coreAddress: [{ origin: "x", accepted: 1 }],
        writes: [],
        formPost: [],
      },
      "coreAddress[0] needs an origin as a string and accepted as true or false.",
    ],
  ])("refuses a file that %s", (_, value, message) => {
    expect(() => readRequestCases(value)).toThrow(message);
  });
});

describe("writeCases", () => {
  const row = {
    name: "a case",
    core: "https://core.robkit.dev",
    method: "POST",
    target: "/notes?x=1",
    headers: { origin: "https://notes.robkit.dev" },
    refused: true,
  };
  const read = (writes: unknown[]) =>
    readRequestCases({
      address: [],
      cookies: [],
      coreAddress: [],
      writes,
      formPost: [],
      headers: [],
    }).writes;

  it("reads every write row of request-cases.json", () => {
    expect(writeCases.length).toBeGreaterThan(0);
  });

  it.each([
    [
      "has no writes list",
      { address: [], cookies: [], coreAddress: [] },
      'a "writes" list',
    ],
    [
      "holds a row that isn't an object",
      { address: [], cookies: [], coreAddress: [], writes: [1], formPost: [] },
      "writes[0] must be an object.",
    ],
    ...[
      { method: 1 },
      { target: null },
      { headers: { origin: 1 } },
      { headers: "origin" },
      { refused: "yes" },
    ].map((change): [string, unknown, string] => [
      `holds a row with ${JSON.stringify(change)}`,
      {
        address: [],
        cookies: [],
        coreAddress: [],
        writes: [{ ...row, ...change }],
        formPost: [],
      },
      "writes[0] needs a name, core, method and target as strings, headers as an object of strings, and refused as true or false.",
    ]),
  ])("refuses a file that %s", (_, value, message) => {
    expect(() => readRequestCases(value)).toThrow(message);
  });

  it("sends a row's method and headers to its target on example", () => {
    const [asking] = read([row]);
    if (!asking) throw new Error("One row went in.");

    expect(writeRequest(asking)).toEqual({
      url: "https://example.robkit.dev/notes?x=1",
      method: "POST",
      headers: { origin: "https://notes.robkit.dev" },
    });
  });

  it("expects the guard's 403 for a refused row, and the handler for any other", () => {
    const [refused, passes] = read([row, { ...row, refused: false }]);
    if (!refused || !passes) throw new Error("Two rows went in.");

    expect([writeAnswer(refused), writeAnswer(passes)]).toEqual([
      { status: 403, reached: false },
      { status: 200, reached: true },
    ]);
  });
});

describe("formPostCases", () => {
  const row = {
    name: "a case",
    core: "https://core.robkit.dev",
    referer: "https://example.robkit.dev/notes?x=1",
    next: "https://example.robkit.dev/notes?x=1",
  };
  const read = (formPost: unknown[]) =>
    readRequestCases({
      address: [],
      cookies: [],
      coreAddress: [],
      writes: [],
      formPost,
      headers: [],
    }).formPost;

  it("reads every form-post row of request-cases.json", () => {
    expect(formPostCases.length).toBeGreaterThan(0);
  });

  it.each([
    [
      "has no formPost list",
      { address: [], cookies: [], coreAddress: [], writes: [] },
      'a "formPost" list',
    ],
    [
      "holds a row that isn't an object",
      { address: [], cookies: [], coreAddress: [], writes: [], formPost: [1] },
      "formPost[0] must be an object.",
    ],
    ...[{ referer: 1 }, { next: null }].map(
      (change): [string, unknown, string] => [
        `holds a row with ${JSON.stringify(change)}`,
        {
          address: [],
          cookies: [],
          coreAddress: [],
          writes: [],
          formPost: [{ ...row, ...change }],
        },
        "formPost[0] needs a name, core and next as strings, and referer as a string or left out.",
      ],
    ),
  ])("refuses a file that %s", (_, value, message) => {
    expect(() => readRequestCases(value)).toThrow(message);
  });

  it("posts a form that navigates from the app's own origin, with its Referer if it has one", () => {
    const { referer, ...noReferer } = row;
    const [withOne, withNone] = read([row, noReferer]);
    if (!withOne || !withNone) throw new Error("Two rows went in.");

    expect([formPostRequest(withOne), formPostRequest(withNone)]).toEqual([
      {
        url: "https://example.robkit.dev/notes",
        method: "POST",
        headers: {
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
          referer,
        },
      },
      {
        url: "https://example.robkit.dev/notes",
        method: "POST",
        headers: {
          "sec-fetch-mode": "navigate",
          "sec-fetch-site": "same-origin",
        },
      },
    ]);
  });

  it("expects the page's one link through the refresh path to next", () => {
    const [asking] = read([row]);
    if (!asking) throw new Error("One row went in.");

    expect(formPostAnswer(asking)).toEqual({
      status: 401,
      type: "text/html; charset=UTF-8",
      links: [
        "https://example.robkit.dev/_robkit/refresh?next=https%3A%2F%2Fexample.robkit.dev%2Fnotes%3Fx%3D1",
      ],
    });
  });

  it("reads each link as a browser does, and none that markup broke", () => {
    expect(
      linksIn('<p><a href="/a?b=1&amp;c=2">One</a> <a href="/x"y">Two</a></p>'),
    ).toEqual(["/a?b=1&c=2"]);
  });
});

describe("headerCases", () => {
  const row = {
    name: "a case",
    core: "https://core.robkit.dev",
    access: "owner",
    method: "GET",
    target: "/notes?x=1",
    headers: { "sec-fetch-mode": "navigate" },
    status: 302,
    reached: false,
    answer: { "x-content-type-options": "nosniff" },
  };
  const read = (headers: unknown[]) =>
    readRequestCases({
      address: [],
      cookies: [],
      coreAddress: [],
      writes: [],
      formPost: [],
      headers,
    }).headers;
  const lists = {
    address: [],
    cookies: [],
    coreAddress: [],
    writes: [],
    formPost: [],
  };

  it("reads every header row of request-cases.json", () => {
    expect(headerCases.length).toBeGreaterThan(0);
  });

  it("reads a row, taking a left-out signedOut as false", () => {
    expect(read([row])).toEqual([{ ...row, signedOut: false }]);
  });

  it.each([
    ["has no headers list", lists, 'a "headers" list'],
    [
      "holds a row that isn't an object",
      { ...lists, headers: [1] },
      "headers[0] must be an object.",
    ],
    ...[
      { access: "roles" },
      { method: 1 },
      { headers: { origin: 1 } },
      { signedOut: "yes" },
      { status: "302" },
      { status: 302.5 },
      { reached: 1 },
      { answer: { "x-frame-options": 1 } },
      { answer: { "x-powered-by": "robkit" } },
    ].map((change): [string, unknown, string] => [
      `holds a row with ${JSON.stringify(change)}`,
      { ...lists, headers: [{ ...row, ...change }] },
      'headers[0] needs a name, core, method and target as strings, access as "open" or "owner", headers as an object of strings, signedOut as true, false or left out, status as a whole number, reached as true or false, and answer as an object of strings named from x-frame-options, x-content-type-options, strict-transport-security, content-security-policy.',
    ]),
  ])("refuses a file that %s", (_, value, message) => {
    expect(() => readRequestCases(value)).toThrow(message);
  });

  it("sends a row's method and headers to its target on example, with core's word when it says", () => {
    const [holdsNothing, signedOut] = read([row, { ...row, signedOut: true }]);
    if (!holdsNothing || !signedOut) throw new Error("Two rows went in.");

    expect([headerRequest(holdsNothing), headerRequest(signedOut)]).toEqual([
      {
        url: "https://example.robkit.dev/notes?x=1",
        method: "GET",
        headers: { "sec-fetch-mode": "navigate" },
        access: { kind: "owner" },
      },
      {
        url: "https://example.robkit.dev/notes?x=1",
        method: "GET",
        headers: {
          "sec-fetch-mode": "navigate",
          cookie: signedOutCookie(row.core),
        },
        access: { kind: "owner" },
      },
    ]);
  });

  it("expects each header the row names once, and none it leaves out", () => {
    const [asking] = read([row]);
    if (!asking) throw new Error("One row went in.");

    expect(headerAnswer(asking)).toEqual({
      status: 302,
      reached: false,
      headers: {
        "x-frame-options": null,
        "x-content-type-options": "nosniff",
        "strict-transport-security": null,
        "content-security-policy": null,
      },
    });
  });

  it("reads a header sent twice as both values, so a row can't match it", () => {
    const headers = new Headers([
      ["x-frame-options", "SAMEORIGIN"],
      ["x-frame-options", "SAMEORIGIN"],
      ["x-content-type-options", "nosniff"],
    ]);

    expect(answerHeadersOf(headers)).toEqual({
      "x-frame-options": "SAMEORIGIN, SAMEORIGIN",
      "x-content-type-options": "nosniff",
      "strict-transport-security": null,
      "content-security-policy": null,
    });
  });
});
