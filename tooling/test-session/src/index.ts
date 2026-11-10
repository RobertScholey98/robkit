import { orThrow, readCoreUrl, type CoreOrigin } from "@robkit/input";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AccessRule, Viewer } from "@robkit/guard";
import type { ConformanceCase } from "@robkit/guard/conformance";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from "jose";
import { expect, onTestFinished } from "vitest";
import type {
  AddressCase,
  AnswerHeader,
  CookieCase,
  FormPostCase,
  HeaderCase,
  WriteCase,
} from "./request-cases.ts";
import { aViewer } from "./brands.ts";
import { listeningPort } from "./known.ts";

export {
  addressCases,
  cookieCases,
  coreAddressCases,
  formPostCases,
  headerCases,
  readRequestCases,
  writeCases,
  type AddressCase,
  type AnswerHeader,
  type CookieCase,
  type CoreAddressCase,
  type FormPostCase,
  type HeaderCase,
  type RequestCases,
  type WriteCase,
} from "./request-cases.ts";
export {
  aCodeId,
  aCoreOrigin,
  aDomain,
  aRoleId,
  aViewer,
  slug,
  type ViewerOptions,
} from "./brands.ts";
export { printedOnExit } from "./exit.ts";

// Written out rather than imported from @robkit/session, whose own tests use
// this package. If session's cookies, lifetime, callback or word that nobody
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
}

/** Long enough ago that a token has expired. */
const expiredAgeSeconds = sessionTokenLifetimeSeconds + 5 * 60;

/**
 * The session cookie's name on the install at `origin`, as
 * `sessionCookies` in @robkit/session names it: `__Host-` over https, plain
 * over http.
 */
export function sessionCookieOn(origin: string): string {
  return new URL(origin).protocol === "https:"
    ? `__Host-${sessionCookie}`
    : sessionCookie;
}

/**
 * The app's cookie on the install at `origin`, saying core said just now
 * that nobody is signed in.
 */
export function signedOutCookie(origin: string): string {
  return `${sessionCookieOn(origin)}=signed-out.${String(Math.floor(Date.now() / 1000))}`;
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

  return { publicKey, token };
}

/**
 * The cookie header a conformance case's visitor sends `slug` on the install
 * at `origin`, if any, with tokens `key` signs.
 */
async function cookieFor(
  origin: string,
  key: SigningKey,
  { session, guestRoles, otherToken }: ConformanceCase,
  slug: string = app,
): Promise<{ cookie?: string }> {
  if (session === "signed-out") return { cookie: signedOutCookie(origin) };
  const other =
    otherToken &&
    {
      "another-app": `not${slug}`,
      core: "core",
      "no-audience": null,
    }[otherToken];
  const value = {
    unknown:
      other === undefined ? undefined : () => key.token({ audience: other }),
    expired: () => key.token({ ageSeconds: expiredAgeSeconds, audience: slug }),
    owner: () => key.token({ audience: slug }),
    guest: () => key.token({ holder: guest(guestRoles), audience: slug }),
  }[session];
  return value ? { cookie: `${sessionCookieOn(origin)}=${await value()}` } : {};
}

/** Core as an app's guard sees it: its JWKS and its app catalog's rules. */
export interface FakeCore {
  /** Core's public origin, `http://core.robkit.localhost:<port>`. */
  origin: CoreOrigin;
  /** The hub's origin beside it, `http://hub.robkit.localhost:<port>`. */
  hub: string;
  /**
   * A page on the app the tests guard, beside core on its port, as the dev
   * proxy puts every app: `http://example.robkit.localhost:<port>/notes?x=1`.
   */
  page: string;
  /** The key core signs sessions with. */
  key: SigningKey;
  /**
   * The cookie header a conformance case's visitor sends `slug`, if any:
   * a token for it, another's token, or core's word that nobody is signed
   * in.
   */
  cookieFor(
    asking: ConformanceCase,
    slug?: string,
  ): Promise<{ cookie?: string }>;
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
  const core: FakeCore = {
    origin: orThrow(
      readCoreUrl({
        ROBKIT_CORE_URL: `http://core.robkit.localhost:${String(port)}`,
      }),
    ),
    hub: `http://hub.robkit.localhost:${String(port)}`,
    page: `http://${app}.robkit.localhost:${String(port)}/notes?x=1`,
    key,
    cookieFor: (asking, slug) => cookieFor(core.origin, key, asking, slug),
    rules: {},
    status: 200,
    fetched: [],
  };
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
  core: { origin: string },
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
  core: { origin: string; hub: string },
): PageAnswer {
  switch (outcome) {
    case "allow": {
      const viewers: Record<ConformanceCase["session"], Viewer | undefined> = {
        unknown: undefined,
        "signed-out": { kind: "nobody" },
        expired: undefined,
        owner,
        guest: aViewer({ kind: "guest", roles: guestRoles ?? [] }),
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

/** The cookie header a case's browser sends, if any. */
export function addressCookie({ core, signedOut }: AddressCase): {
  cookie?: string;
} {
  return signedOut ? { cookie: signedOutCookie(core) } : {};
}

/** What the guard must answer a case's page load with. */
export function addressAnswer({
  core,
  signedOut,
  next,
}: AddressCase): Omit<PageAnswer, "viewer"> {
  if (!signedOut) {
    return { status: 302, location: refreshLocation(next, { origin: core }) };
  }
  const hub = new URL("/", core.replace("//core.", "//hub."));
  hub.searchParams.set("next", next);
  return { status: 302, location: hub.href };
}

/**
 * The page a cookie case loads, on `example` beside the case's core, and
 * its `Cookie` header as Node's HTTP server hands it on: each byte as the
 * character with that code, which is Latin-1.
 */
export function cookieRequest({ core, cookie }: CookieCase): {
  page: string;
  cookie: string;
} {
  return {
    page: `${core.replace("//core.", `//${app}.`)}/`,
    cookie: Buffer.from(cookie).toString("latin1"),
  };
}

/** What the guard must answer a cookie case's page load with. */
export function cookieAnswer(asking: CookieCase): PageAnswer {
  if (asking.reads) {
    return { status: 200, location: null, viewer: { kind: "nobody" } };
  }
  return {
    status: 302,
    location: refreshLocation(cookieRequest(asking).page, {
      origin: asking.core,
    }),
    viewer: undefined,
  };
}

/**
 * The request a write case sends: its method and headers, to its target on
 * `example` beside its core.
 */
export function writeRequest({ core, method, target, headers }: WriteCase): {
  url: string;
  method: string;
  headers: Record<string, string>;
} {
  return {
    url: `${core.replace("//core.", `//${app}.`)}${target}`,
    method,
    headers,
  };
}

/**
 * What a write case's request must get: the guard's 403, with no handler
 * run, or the app's handler.
 */
export function writeAnswer({ refused }: WriteCase): {
  status: number;
  reached: boolean;
} {
  return refused
    ? { status: 403, reached: false }
    : { status: 200, reached: true };
}

/**
 * The form a form-post case's browser sends: a POST to `example`, beside
 * its core, that navigates, from the app's own origin, with its `Referer`.
 */
export function formPostRequest({ core, referer }: FormPostCase): {
  url: string;
  method: string;
  headers: Record<string, string>;
} {
  return {
    url: `${core.replace("//core.", `//${app}.`)}/notes`,
    method: "POST",
    headers: {
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      ...(referer === undefined ? {} : { referer }),
    },
  };
}

/**
 * What the guard must answer a form-post case with: its 401 page, whose
 * one link goes through the app's refresh path back to `next`.
 */
export function formPostAnswer({ core, next }: FormPostCase): {
  status: number;
  type: string;
  links: string[];
} {
  const link = new URL(
    "/_robkit/refresh",
    core.replace("//core.", `//${app}.`),
  );
  link.searchParams.set("next", next);
  return {
    status: 401,
    type: "text/html; charset=UTF-8",
    links: [link.href],
  };
}

/**
 * The links in a page's HTML, as a browser reads each `href`: every
 * `&amp;` back to `&`. A link the page broke with unescaped text isn't
 * one it means.
 */
export function linksIn(html: string): string[] {
  return [...html.matchAll(/<a href="([^"<>]*)">/g)].map(([, href = ""]) =>
    href.replaceAll("&amp;", "&"),
  );
}

/**
 * The request a header case sends: its method and headers, with core's
 * word that nobody is signed in when the row says, to its target on
 * `example` beside its core, and the rule the app's guard holds.
 */
export function headerRequest({
  core,
  access,
  method,
  target,
  headers,
  signedOut,
}: HeaderCase): {
  url: string;
  method: string;
  headers: Record<string, string>;
  access: AccessRule;
} {
  return {
    url: `${core.replace("//core.", `//${app}.`)}${target}`,
    method,
    headers: signedOut
      ? { ...headers, cookie: signedOutCookie(core) }
      : { ...headers },
    access: { kind: access },
  };
}

/** Each of `answerHeaderNames` an answer carries, or null for one it lacks. */
export type AnswerHeaders = Record<AnswerHeader, string | null>;

/** Each of `answerHeaderNames`, with the value `read` gives it. */
function answerHeaders(
  read: (name: AnswerHeader) => string | null,
): AnswerHeaders {
  return {
    "x-frame-options": read("x-frame-options"),
    "x-content-type-options": read("x-content-type-options"),
    "strict-transport-security": read("strict-transport-security"),
    "content-security-policy": read("content-security-policy"),
  };
}

/**
 * Each of `answerHeaderNames` in `headers`, as `Headers.get` reads it: a
 * header sent twice reads as both values joined with a comma.
 */
export function answerHeadersOf(headers: Headers): AnswerHeaders {
  return answerHeaders((name) => headers.get(name));
}

/**
 * What a header case's request must get: its status, whether the app's
 * handler answered, and each of `answerHeaderNames` once with the row's
 * value, or not at all.
 */
export function headerAnswer({ status, reached, answer }: HeaderCase): {
  status: number;
  reached: boolean;
  headers: AnswerHeaders;
} {
  return {
    status,
    reached,
    headers: answerHeaders((name) => answer[name] ?? null),
  };
}
