import {
  guard,
  type AccessRule,
  type Decision,
  type SessionState,
  type Viewer,
} from "@robkit/guard";
import {
  coreAccess,
  coreKeys,
  readSessionToken,
  sessionCookie,
  type VerifyKey,
} from "@robkit/session";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

/** Who may open the app: a rule of its own, or the one the owner set in admin. */
export type GuardedRule =
  | {
      /** A fixed rule, for an app core's catalog doesn't hold, such as admin. */
      access: AccessRule;
    }
  | {
      /**
       * The app's slug. Its rule comes from core's catalog and is kept for
       * a minute, so a change in admin reaches the app within one.
       */
      app: string;
    };

export type GuardedOptions = GuardedRule & {
  /**
   * Core's public origin, such as `http://core.robkit.localhost:3000`. The
   * hub is beside it on `hub.`. Config, never the request's Host, so a
   * request can't choose whose keys the app trusts.
   */
  core: string;
  /** Core's public keys. By default they come from core's JWKS, once. */
  keys?: VerifyKey;
};

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

/** Core's origin and the hub's beside it, from core's public origin. */
function platformOrigins(core: string): { core: string; hub: string } {
  const url = URL.canParse(core) ? new URL(core) : undefined;
  const web = url?.protocol === "https:" || url?.protocol === "http:";
  if (!url || !web || !url.hostname.startsWith("core.")) {
    throw new Error(
      `core must be core's public origin, such as http://core.robkit.localhost:3000, not ${core}`,
    );
  }
  const hub = new URL(url.origin);
  hub.hostname = `hub.${url.hostname.slice("core.".length)}`;
  return { core: url.origin, hub: hub.origin };
}

/**
 * A page load can follow a redirect to the hub or core. A fetch from the
 * page, or a server calling the app, can't, so it gets 401 and the place to
 * send the browser. Without fetch metadata, only a request that accepts HTML
 * counts as a page load.
 */
function isNavigation(c: Context): boolean {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return false;
  const mode = c.req.header("sec-fetch-mode");
  if (mode !== undefined) return mode === "navigate";
  return c.req.header("accept")?.includes("text/html") ?? false;
}

const elsewhere = {
  login: { app: "hub", path: "/", error: "Sign in to use this app." },
  refresh: {
    app: "core",
    path: "/refresh",
    error: "Your session needs refreshing.",
  },
} as const;

/**
 * Runs robkit's guard on every request: checks the session cookie against
 * core's public key, then lets the request through with `c.var.viewer`
 * set, sends the browser to log in or refresh, or answers 404.
 */
export function guarded(
  options: GuardedOptions,
): MiddlewareHandler<GuardedEnv> {
  const { core, keys } = options;
  const origins = platformOrigins(core);
  const verifyKey = keys ?? coreKeys(origins.core);
  const ruleOf =
    "access" in options
      ? () => Promise.resolve(options.access)
      : coreAccess(origins.core, options.app);

  const sessionOf = async (c: Context): Promise<SessionState> => {
    const token = getCookie(c, sessionCookie);
    if (!token) return { state: "signed-out" };
    const read = await readSessionToken(verifyKey, token, new Date());
    if (!read) return { state: "signed-out" };
    if (read.expired) return { state: "expired" };
    const viewer =
      read.kind === "owner"
        ? { kind: read.kind, id: read.id }
        : { kind: read.kind, id: read.id, roles: read.roles };
    return { state: "signed-in", viewer };
  };

  return async (c, next) => {
    let session: SessionState;
    try {
      session = await sessionOf(c);
    } catch {
      // Not knowing who is asking isn't the same as nobody asking, so the
      // browser isn't sent to log in.
      return c.text("Can't reach core to check your session.", 503);
    }
    let rule: AccessRule;
    try {
      rule = await ruleOf();
    } catch {
      return c.text("Can't reach core to check who may open this app.", 503);
    }
    const decision: Decision = guard(rule, session);
    switch (decision.outcome) {
      case "allow":
        c.set("viewer", decision.viewer);
        await next();
        return;
      case "not-found":
        return c.text("Not found", 404);
      case "login":
      case "refresh": {
        const { app, path, error } = elsewhere[decision.outcome];
        const location = new URL(path, origins[app]);
        location.searchParams.set("next", publicUrl(c).href);
        c.header("Cache-Control", "no-store");
        if (!isNavigation(c)) {
          return c.json({ error, location: location.href }, 401);
        }
        return c.redirect(location.href, 302);
      }
    }
  };
}
