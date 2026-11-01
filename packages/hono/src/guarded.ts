import {
  guard,
  type AccessRule,
  type Decision,
  type SessionState,
  type Viewer,
} from "@robkit/guard";
import {
  coreKeys,
  readSessionToken,
  sessionCookie,
  type VerifyKey,
} from "@robkit/session";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

export interface GuardedOptions {
  /** Who may open the app. */
  access: AccessRule;
  /** The install's domain, such as `robkit.localhost`. */
  domain: string;
  /** Core's public keys. By default they come from core's JWKS, once. */
  keys?: VerifyKey;
}

/** Handlers behind `guarded` read the viewer as `c.var.viewer`. */
export interface GuardedEnv {
  Variables: { viewer: Viewer };
}

/** The URL the browser asked for, as it saw it in front of the proxy. */
function publicUrl(c: Context): URL {
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
  return url;
}

/** Another platform app's origin, such as the hub's, beside this app. */
function sibling(page: URL, slug: string, domain: string): string {
  const url = new URL(page.origin);
  url.hostname = `${slug}.${domain}`;
  return url.origin;
}

/**
 * A page load can follow a redirect to the hub or core. A fetch from the
 * page can't, so it gets 401 and the place to send the browser.
 */
function isNavigation(c: Context): boolean {
  const mode = c.req.header("sec-fetch-mode");
  return (
    (c.req.method === "GET" || c.req.method === "HEAD") &&
    (mode === undefined || mode === "navigate")
  );
}

const elsewhere = {
  login: { slug: "hub", path: "/", error: "Sign in to use this app." },
  refresh: {
    slug: "core",
    path: "/refresh",
    error: "Your session needs refreshing.",
  },
} as const;

/**
 * Runs robkit's guard on every request: checks the session cookie against
 * core's public key, then lets the request through with `c.var.viewer`
 * set, sends the browser to log in or refresh, or answers 404.
 */
export function guarded({
  access,
  domain,
  keys,
}: GuardedOptions): MiddlewareHandler<GuardedEnv> {
  const keySets = new Map<string, VerifyKey>();
  const keysFor = (coreOrigin: string): VerifyKey => {
    if (keys) return keys;
    let found = keySets.get(coreOrigin);
    if (!found) {
      found = coreKeys(coreOrigin);
      keySets.set(coreOrigin, found);
    }
    return found;
  };

  const sessionOf = async (c: Context, page: URL): Promise<SessionState> => {
    const token = getCookie(c, sessionCookie);
    if (!token) return { state: "signed-out" };
    const read = await readSessionToken(
      keysFor(sibling(page, "core", domain)),
      token,
      new Date(),
    );
    if (!read) return { state: "signed-out" };
    if (read.expired) return { state: "expired" };
    return { state: "signed-in", viewer: { kind: "owner", id: read.ownerId } };
  };

  return async (c, next) => {
    const page = publicUrl(c);
    const decision: Decision = guard(access, await sessionOf(c, page));
    switch (decision.outcome) {
      case "allow":
        c.set("viewer", decision.viewer);
        await next();
        return;
      case "not-found":
        return c.text("Not found", 404);
      case "login":
      case "refresh": {
        const { slug, path, error } = elsewhere[decision.outcome];
        const location = new URL(path, sibling(page, slug, domain));
        location.searchParams.set("next", page.href);
        c.header("Cache-Control", "no-store");
        if (!isNavigation(c)) {
          return c.json({ error, location: location.href }, 401);
        }
        return c.redirect(location.href, 302);
      }
    }
  };
}
