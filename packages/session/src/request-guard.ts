import {
  guard,
  type AccessRule,
  type SessionState,
  type Viewer,
} from "@robkit/guard";
import { coreAccess } from "./core-access.ts";
import { coreKeys } from "./core-keys.ts";
import { sessionLapsedResponse } from "./session-lapsed.ts";
import { readSessionToken, sessionCookie } from "./session-token.ts";

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
};

/** What the app does with a request: serve it to the viewer, or answer it. */
export type RequestDecision = { viewer: Viewer } | { response: Response };

/** The URL the browser asked for, as it saw it in front of the proxy. */
function publicUrl(request: Request): URL {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
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
function isNavigation(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const mode = request.headers.get("sec-fetch-mode");
  if (mode !== null) return mode === "navigate";
  return request.headers.get("accept")?.includes("text/html") ?? false;
}

function sessionTokenIn(request: Request): string | undefined {
  for (const pair of request.headers.get("cookie")?.split(";") ?? []) {
    const [name, ...value] = pair.split("=");
    if (name?.trim() === sessionCookie) return value.join("=").trim();
  }
  return undefined;
}

const elsewhere = {
  login: { app: "hub", path: "/", error: "Sign in to use this app." },
  refresh: {
    app: "core",
    path: "/refresh",
    error: "Your session needs refreshing.",
  },
} as const;

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=UTF-8" },
  });

/**
 * robkit's guard on web-standard requests, for adapters to run on every
 * request. It checks the session cookie against core's public key, then
 * lets the request through to the viewer, sends the browser to log in or
 * refresh, or answers 404.
 */
export function requestGuard(
  options: GuardedOptions,
): (request: Request) => Promise<RequestDecision> {
  const origins = platformOrigins(options.core);
  const verifyKey = coreKeys(origins.core);
  const ruleOf =
    "access" in options
      ? () => Promise.resolve(options.access)
      : coreAccess(origins.core, options.app);

  const sessionOf = async (request: Request): Promise<SessionState> => {
    const token = sessionTokenIn(request);
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

  return async (request) => {
    let session: SessionState;
    try {
      session = await sessionOf(request);
    } catch {
      // Not knowing who is asking isn't the same as nobody asking, so the
      // browser isn't sent to log in.
      return { response: text("Can't reach core to check your session.", 503) };
    }
    let rule: AccessRule;
    try {
      rule = await ruleOf();
    } catch {
      return {
        response: text("Can't reach core to check who may open this app.", 503),
      };
    }
    const decision = guard(rule, session);
    switch (decision.outcome) {
      case "allow":
        return { viewer: decision.viewer };
      case "not-found":
        return { response: text("Not found", 404) };
      case "login":
      case "refresh": {
        const { app, path, error } = elsewhere[decision.outcome];
        const location = new URL(path, origins[app]);
        location.searchParams.set("next", publicUrl(request).href);
        if (!isNavigation(request)) {
          return {
            response: sessionLapsedResponse({
              outcome: decision.outcome,
              error,
              location: location.href,
            }),
          };
        }
        return {
          response: new Response(null, {
            status: 302,
            headers: { "cache-control": "no-store", location: location.href },
          }),
        };
      }
    }
  };
}
