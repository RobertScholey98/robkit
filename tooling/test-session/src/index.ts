import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { AccessRule, Viewer } from "@robkit/guard";
import type { ConformanceCase } from "@robkit/guard/conformance";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { onTestFinished } from "vitest";

// Written out rather than imported from @robkit/session, whose own tests use
// this package. If session's cookie or lifetime changes, its guard tests fail.
const sessionCookie = "robkit_session";
const sessionTokenLifetimeSeconds = 15 * 60;

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

/** A key pair standing in for core's signing key. */
export interface SigningKey {
  /** The half core serves as its JWKS. */
  publicKey: CryptoKey;
  /** A session token shaped like core's, issued `ageSeconds` ago. */
  token(ageSeconds?: number, holder?: Holder): Promise<string>;
  /** The cookie header a conformance case's visitor sends, if any. */
  cookieFor(asking: ConformanceCase): Promise<{ cookie?: string }>;
}

/** Long enough ago that a token has expired. */
const expiredAgeSeconds = sessionTokenLifetimeSeconds + 5 * 60;

export async function signingKey(): Promise<SigningKey> {
  // Extractable, so a fake core can serve the public half as its JWKS.
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });

  const token = (ageSeconds = 0, holder: Holder = owner) => {
    const iat = Math.floor(Date.now() / 1000) - ageSeconds;
    const roles = holder.kind === "guest" ? { roles: holder.roles } : {};
    return new SignJWT({ sid: "session-1", kind: holder.kind, ...roles })
      .setProtectedHeader({ alg: "EdDSA", kid: "key-1" })
      .setSubject(holder.id)
      .setIssuedAt(iat)
      .setExpirationTime(iat + sessionTokenLifetimeSeconds)
      .sign(privateKey);
  };

  const cookieFor = async ({ session, guestRoles }: ConformanceCase) => {
    const value = {
      "signed-out": undefined,
      expired: () => token(expiredAgeSeconds),
      owner: () => token(),
      guest: () => token(0, guest(guestRoles)),
    }[session];
    return value ? { cookie: `${sessionCookie}=${await value()}` } : {};
  };

  return { publicKey, token, cookieFor };
}

/** Core as an app's guard sees it: its JWKS and its app catalog's rules. */
export interface FakeCore {
  /** Core's public origin, `http://core.robkit.localhost:<port>`. */
  origin: string;
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
  const { port } = server.address() as AddressInfo;
  core.origin = `http://core.robkit.localhost:${String(port)}`;
  return core;
}

/** What an adapter answers a conformance case's page load with. */
export interface PageAnswer {
  status: number;
  location: string | null;
  /** The viewer the app's handlers get, when the guard lets them in. */
  viewer?: Viewer | undefined;
}

/**
 * The answer every adapter must give a conformance case's visitor loading
 * `page`, behind the core at `coreOrigin`.
 */
export function conformanceAnswer(
  { session, guestRoles, outcome }: ConformanceCase,
  page: string,
  coreOrigin: string,
): PageAnswer {
  const core = new URL(coreOrigin);
  const hub = new URL(coreOrigin);
  hub.hostname = hub.hostname.replace(/^core\./, "hub.");
  const next = `?next=${encodeURIComponent(page)}`;
  switch (outcome) {
    case "allow": {
      const viewer = {
        "signed-out": { kind: "nobody" } as const,
        expired: undefined,
        owner,
        guest: guest(guestRoles),
      }[session] as Viewer;
      return { status: 200, location: null, viewer };
    }
    case "login":
      return {
        status: 302,
        location: `${hub.origin}/${next}`,
        viewer: undefined,
      };
    case "refresh":
      return {
        status: 302,
        location: `${core.origin}/refresh${next}`,
        viewer: undefined,
      };
    case "not-found":
      return { status: 404, location: null, viewer: undefined };
  }
}
