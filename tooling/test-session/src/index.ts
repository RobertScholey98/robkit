import { orThrow } from "@robkit/input";
import { once } from "node:events";
import { createServer } from "node:http";
import {
  readCodeId,
  type AccessRule,
  type RoleId,
  type Viewer,
} from "@robkit/guard";
import type { ConformanceCase } from "@robkit/guard/conformance";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { expect, onTestFinished } from "vitest";
import { listeningPort } from "./known.ts";

// Written out rather than imported from @robkit/session, whose own tests use
// this package. If session's cookie, lifetime, callback or word that nobody
// is signed in changes, its guard tests fail.
const sessionCookie = "robkit_session";
const sessionTokenLifetimeSeconds = 15 * 60;
const appSessionPath = "/_robkit/session";

/** The app the guard's and adapters' tests guard, unless they name another. */
export const app = "example";

/** The owner, as the tokens below name them. */
export const owner = { kind: "owner", id: "owner-1" } as const;

/** Whose session a token is for. */
export type Holder =
  typeof owner | { kind: "guest"; id: string; roles: readonly string[] };

/** A guest holding `roles`, by id. */
export const guest = (roles: readonly string[] = []): Holder => ({
  kind: "guest",
  id: "code-1",
  roles,
});

export interface TokenOptions {
  /** How long ago core issued it. Now if absent. */
  ageSeconds?: number;
  /** The owner if absent. */
  holder?: Holder;
  /**
   * Who it is for: an app's slug, or `core` for core's own token, which
   * carries the session's id. `null` for none. `app` if absent.
   */
  audience?: string | null;
}

/** A key pair standing in for core's signing key. */
export interface SigningKey {
  /** The half core serves as its JWKS. */
  publicKey: CryptoKey;
  /** A session token shaped like core's. */
  token(options?: TokenOptions): Promise<string>;
  /**
   * The cookie header a conformance case's visitor sends `slug`, if any:
   * a token for it, another's token, or core's word that nobody is signed
   * in.
   */
  cookieFor(
    asking: ConformanceCase,
    slug?: string,
  ): Promise<{ cookie?: string }>;
}

/** Long enough ago that a token has expired. */
const expiredAgeSeconds = sessionTokenLifetimeSeconds + 5 * 60;

/** The app's cookie, saying core said just now that nobody is signed in. */
export function signedOutCookie(): string {
  return `${sessionCookie}=signed-out.${String(Math.floor(Date.now() / 1000))}`;
}

export async function signingKey(): Promise<SigningKey> {
  // Extractable, so a fake core can serve the public half as its JWKS.
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });

  const token = ({
    ageSeconds = 0,
    holder = owner,
    audience = app,
  }: TokenOptions = {}) => {
    const iat = Math.floor(Date.now() / 1000) - ageSeconds;
    const roles = holder.kind === "guest" ? { roles: holder.roles } : {};
    // Core's own token, and one an older robkit issued with no audience,
    // carry the session's id. An app's token doesn't.
    const session =
      audience === "core" || audience === null ? { sid: "session-1" } : {};
    const jwt = new SignJWT({ ...session, kind: holder.kind, ...roles })
      .setProtectedHeader({ alg: "EdDSA", kid: "key-1" })
      .setSubject(holder.id)
      .setIssuedAt(iat)
      .setExpirationTime(iat + sessionTokenLifetimeSeconds);
    return (audience === null ? jwt : jwt.setAudience(audience)).sign(
      privateKey,
    );
  };

  const cookieFor = async (
    { session, guestRoles, otherToken }: ConformanceCase,
    slug = app,
  ) => {
    if (session === "signed-out") return { cookie: signedOutCookie() };
    const other =
      otherToken &&
      {
        "another-app": `not${slug}`,
        core: "core",
        "no-audience": null,
      }[otherToken];
    const value = {
      unknown:
        other === undefined ? undefined : () => token({ audience: other }),
      expired: () => token({ ageSeconds: expiredAgeSeconds, audience: slug }),
      owner: () => token({ audience: slug }),
      guest: () => token({ holder: guest(guestRoles), audience: slug }),
    }[session];
    return value ? { cookie: `${sessionCookie}=${await value()}` } : {};
  };

  return { publicKey, token, cookieFor };
}

/** Core as an app's guard sees it: its JWKS and its app catalog's rules. */
export interface FakeCore {
  /** Core's public origin, `http://core.robkit.localhost:<port>`. */
  origin: string;
  /** The hub's origin beside it, `http://hub.robkit.localhost:<port>`. */
  hub: string;
  /** The key core signs sessions with. */
  key: SigningKey;
  /** Each app's rule in core's catalog, by slug. */
  rules: Record<string, AccessRule>;
  /** Set to fail every request with this status, such as 503. */
  status: number;
  /** Each request core got, as `<host> <path>`. */
  fetched: string[];
}

/**
 * Core on a loopback port, serving its JWKS and each app's rule, for the
 * guard's and adapters' tests. Call it inside a test: it stops when the test
 * finishes.
 */
export async function fakeCore(): Promise<FakeCore> {
  const key = await signingKey();
  const jwk = {
    ...(await exportJWK(key.publicKey)),
    kid: "key-1",
    alg: "EdDSA",
  };
  const core: FakeCore = {
    origin: "",
    hub: "",
    key,
    rules: {},
    status: 200,
    fetched: [],
  };
  const server = createServer((req, res) => {
    const path = String(req.url);
    core.fetched.push(`${String(req.headers.host)} ${path}`);
    const answer = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const slug = /^\/apps\/([^/]+)\/access$/.exec(path)?.[1];
    const rule = slug === undefined ? undefined : core.rules[slug];
    if (core.status !== 200) answer(core.status, { error: "Down" });
    else if (path === "/.well-known/jwks.json") answer(200, { keys: [jwk] });
    else if (rule) answer(200, rule);
    else answer(404, { error: "Not found" });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  onTestFinished(async () => {
    server.close();
    await once(server, "close");
  });
  const port = listeningPort(server);
  core.origin = `http://core.robkit.localhost:${String(port)}`;
  core.hub = `http://hub.robkit.localhost:${String(port)}`;
  return core;
}

/** A state the guard sends with a refresh: 32 random bytes, base64url. */
const state = "[\\w-]{43}";

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Matches where the guard sends a page load on `page` to ask core: core's
 * `/refresh`, back to `page`, with a state of its own. A Vitest matcher, which
 * `toEqual` compares with a location.
 */
export function refreshLocation(
  page: string,
  core: Pick<FakeCore, "origin">,
): unknown {
  const next = `${core.origin}/refresh?next=${encodeURIComponent(page)}`;
  const matcher: unknown = expect.stringMatching(
    new RegExp(`^${escaped(next)}&state=${state}$`),
  );
  return matcher;
}

/** The state a refresh's location carries. */
export function stateIn(location: string | null): string {
  return new URL(location ?? "").searchParams.get("state") ?? "";
}

/**
 * Where core sends the browser back to `next`'s app with a token, or none,
 * as core's `/refresh` does.
 */
export function callbackFor(
  next: string,
  { state, token }: { state: string; token?: string },
): string {
  const url = new URL(appSessionPath, next);
  url.searchParams.set("next", next);
  url.searchParams.set("state", state);
  if (token !== undefined) url.searchParams.set("token", token);
  return url.href;
}

/** `guest(roles)` as the guard hands them to an app's handlers. */
function guestViewer(roles: RoleId[] = []): Viewer {
  const id = orThrow(readCodeId(guest().id));
  return { kind: "guest", id, roles };
}

/** What an adapter answers a conformance case's page load with. */
export interface PageAnswer {
  status: number;
  /** A URL, null for none, or `refreshLocation`'s matcher for one. */
  location: unknown;
  /** The viewer the app's handlers get, when the guard lets them in. */
  viewer?: Viewer | undefined;
}

/**
 * The answer every adapter must give a conformance case's visitor loading
 * `page`, behind `core`.
 */
export function conformanceAnswer(
  { session, guestRoles, outcome }: ConformanceCase,
  page: string,
  core: Pick<FakeCore, "origin" | "hub">,
): PageAnswer {
  switch (outcome) {
    case "allow": {
      const viewers: Record<ConformanceCase["session"], Viewer | undefined> = {
        unknown: undefined,
        "signed-out": { kind: "nobody" },
        expired: undefined,
        owner,
        guest: guestViewer(guestRoles),
      };
      return { status: 200, location: null, viewer: viewers[session] };
    }
    case "login":
      return {
        status: 302,
        location: `${core.hub}/?next=${encodeURIComponent(page)}`,
        viewer: undefined,
      };
    case "refresh":
      return {
        status: 302,
        location: refreshLocation(page, core),
        viewer: undefined,
      };
    case "not-found":
      return { status: 404, location: null, viewer: undefined };
  }
}
