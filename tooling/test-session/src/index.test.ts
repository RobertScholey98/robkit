import { once } from "node:events";
import { request, type IncomingMessage } from "node:http";
import { conformanceCases } from "@robkit/guard/conformance";
import { createLocalJWKSet, decodeJwt, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import {
  callbackFor,
  conformanceAnswer,
  fakeCore,
  guest,
  owner,
  refreshLocation,
  signedOutCookie,
  signingKey,
  stateIn,
} from "./index.ts";

/** A token's holder and age, as a verifier with core's public key reads it. */
async function read(publicKey: CryptoKey, token: string) {
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
    const key = await signingKey();

    const sent = await Promise.all(
      conformanceCases.map(async (asking): Promise<[string, unknown]> => {
        const { cookie } = await key.cookieFor(asking, "notes");
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

  it("writes core's word that nobody is signed in, as of now", () => {
    expect(signedOutCookie()).toBe(
      `robkit_session=signed-out.${String(Math.floor(Date.now() / 1000))}`,
    );
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
    core.rules.example = { kind: "roles", roles: ["family"] };

    const known = await get(core.origin, "/apps/example/access");
    const unknown = await get(core.origin, "/apps/notes/access");

    expect(known).toEqual({
      status: 200,
      body: { kind: "roles", roles: ["family"] },
    });
    expect(unknown).toEqual({ status: 404, body: { error: "Not found" } });
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
