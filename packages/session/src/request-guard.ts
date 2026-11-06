import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  guard,
  type AccessRule,
  type SessionState,
  type Viewer,
} from "@robkit/guard";
import { appRefreshPath, appSessionPath } from "./app-session.ts";
import { coreAccess } from "./core-access.ts";
import { coreKeys } from "./core-keys.ts";
import {
  installAt,
  isLocal,
  type Install,
  type Slug,
} from "./install-addresses.ts";
import { CoreUnreachableError } from "./loopback-fetch.ts";
import { reportToConsole } from "./report.ts";
import { sessionLapsedResponse } from "./session-lapsed.ts";
import {
  cookieValues,
  readAppToken,
  sessionCookie,
  sessionTokensIn,
} from "./session-token.ts";

export interface GuardedOptions {
  /**
   * The app's slug, which is also its subdomain. The guard accepts only a
   * token core minted for this slug.
   */
  app: Slug;
  /**
   * A fixed rule, for an app core's catalog doesn't hold, such as admin.
   * Without one, the rule comes from core's catalog and is kept for a
   * minute, so a change in admin reaches the app within one.
   */
  access?: AccessRule | undefined;
  /**
   * Core's public origin, such as `http://core.robkit.localhost:3000`. The
   * hub is beside it on `hub.`. Config, never the request's Host, so a
   * request can't choose whose keys the app trusts.
   */
  core: string;
  /**
   * Hears why the guard answered 503 because it couldn't check a request.
   * By default it reports the app's slug, what failed and the cause through
   * `reportToConsole`.
   */
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}

/**
 * Why the guard couldn't check a request, so answered 503 rather than
 * treating the viewer as signed out.
 */
export interface GuardFault {
  /** The app's slug. */
  app: Slug;
  /**
   * What failed: checking the session against core's key, loading the
   * app's access rule, or reaching core at all.
   */
  failed: "core-key" | "access-rule" | "network";
  /** The error behind it. */
  cause: unknown;
}

const whatFailed: Record<GuardFault["failed"], string> = {
  "core-key": "couldn't check the session against core's key",
  "access-rule": "couldn't load the app's access rule from core",
  network: "couldn't reach core",
};

/** The default `onUnavailable`: reports the app, what failed and the cause. */
function reportFault({ app, failed, cause }: GuardFault): void {
  reportToConsole(
    `robkit guard for ${app} answered 503: ${whatFailed[failed]}.`,
    cause,
  );
}

/** What the app does with a request: serve it to the viewer, or answer it. */
export type RequestDecision = { viewer: Viewer } | { response: Response };

/** The cookie holding the state the guard sent core, until core comes back. */
const stateCookie = "robkit_state";

/** How long a trip through core may take before its state is forgotten. */
const stateMaxAgeSeconds = 10 * 60;

/**
 * The app's cookie outlives its token, as long as core's session lasts, so
 * an expired token still says "refresh" rather than nothing.
 */
const appCookieMaxAgeSeconds = 30 * 24 * 60 * 60;

/** How long the app takes core's word that nobody is signed in. */
const signedOutSeconds = 60;

/** The app's cookie when core said nobody is signed in, then the time. */
const signedOutPrefix = "signed-out.";

/** The URL the browser asked for, as it saw it in front of the proxy. */
function publicUrl(request: Request): URL {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
  return url;
}

/** The install core is on, from core's public origin. */
function installOf(core: string): Install {
  const install = installAt(core, "core");
  if (!install) {
    throw new Error(
      `core must be core's public origin, such as http://core.robkit.localhost:3000, not ${core}`,
    );
  }
  return install;
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

/**
 * A page load by a browser that says so, which keeps cookies and so can go
 * through core and come back. A client without fetch metadata, such as a
 * server or a link preview, might not, and would bounce for ever.
 */
function isBrowserNavigation(request: Request): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    request.headers.get("sec-fetch-mode") === "navigate"
  );
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** When core said nobody is signed in, if the cookie holds that. */
function signedOutAt(value: string): number | undefined {
  if (!value.startsWith(signedOutPrefix)) return undefined;
  const at = Number(value.slice(signedOutPrefix.length));
  return Number.isSafeInteger(at) ? at : undefined;
}

/** The state this browser holds for a trip through core, if any. */
function stateIn(request: Request): string | undefined {
  return cookieValues(request.headers.get("cookie"), stateCookie).find(
    (value) => /^[\w-]{43}$/.test(value),
  );
}

function sameState(sent: string | null, held: string): boolean {
  if (sent === null) return false;
  const [a, b] = [Buffer.from(sent), Buffer.from(held)];
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The `next` a request names, if it is a page on the same app. A page under
 * the guard's own paths isn't one.
 */
function nextOn(url: URL): string | undefined {
  const next = url.searchParams.get("next");
  if (next === null || !URL.canParse(next)) return undefined;
  const target = new URL(next);
  return target.origin === url.origin &&
    !target.pathname.startsWith("/_robkit/")
    ? target.href
    : undefined;
}

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=UTF-8",
      "cache-control": "no-store",
    },
  });

function redirect(
  location: string,
  headers: [string, string][] = [],
): Response {
  return new Response(null, {
    status: 302,
    headers: [
      ["cache-control", "no-store"],
      ["location", location],
      ...headers,
    ],
  });
}

const errors = {
  login: "Sign in to use this app.",
  refresh: "Your session needs refreshing.",
  next: "next must be a page on this app.",
  keys: "Can't reach core to check your session.",
} as const;

/**
 * robkit's guard on web-standard requests, for adapters to run on every
 * request. It checks the app's own session cookie against core's public key
 * and the app's slug, then lets the request through to the viewer, sends
 * the browser to core for a token or to the hub to log in, or answers 404.
 *
 * It answers two paths itself: `/_robkit/session`, where core hands the app
 * its token, and `/_robkit/refresh`, where a call from the page sends the
 * browser for a new one.
 */
export function requestGuard(
  options: GuardedOptions,
): (request: Request) => Promise<RequestDecision> {
  const { app, access, onUnavailable = reportFault } = options;
  const install = installOf(options.core);
  const core = install.origin("core");
  const hub = install.origin("hub");
  const verifyKey = coreKeys(core);
  const ruleOf = access ? () => Promise.resolve(access) : coreAccess(core, app);
  const secure = !isLocal(install.domain);

  /** A 503 for a check that failed, after telling `onUnavailable` why. */
  const unavailable = (
    failed: "core-key" | "access-rule",
    cause: unknown,
    body: string,
  ): Response => {
    onUnavailable({
      app,
      failed: cause instanceof CoreUnreachableError ? "network" : failed,
      cause,
    });
    return text(body, 503);
  };

  /** A host-only cookie on the app's own subdomain. */
  const cookie = (name: string, value: string, maxAge: number): string =>
    [
      `${name}=${value}`,
      "Path=/",
      `Max-Age=${String(maxAge)}`,
      "HttpOnly",
      "SameSite=Lax",
      ...(secure ? ["Secure"] : []),
    ].join("; ");

  /**
   * Sends the browser to core's `/refresh`, which comes back to the app's
   * callback with a token for this app, or none, and the same state. Only
   * this browser holds the state, so no one else's link can hand the app a
   * token.
   */
  const toCore = (request: Request, next: string): Response => {
    const state = stateIn(request) ?? randomBytes(32).toString("base64url");
    const location = new URL("/refresh", core);
    location.searchParams.set("next", next);
    location.searchParams.set("state", state);
    return redirect(location.href, [
      ["set-cookie", cookie(stateCookie, state, stateMaxAgeSeconds)],
    ]);
  };

  /**
   * Core sent the browser back with the app's token, or none if nobody is
   * signed in. The guard keeps whichever it got in the app's cookie and
   * sends the browser on to `next`. Each refusal is a page rather than a
   * redirect, so a browser that can't keep the cookie stops here instead of
   * going round again.
   */
  const arrive = async (request: Request, url: URL): Promise<Response> => {
    const next = nextOn(url);
    if (!next) return text(errors.next, 400);
    const held = stateIn(request);
    if (!held) {
      return text(
        "This browser didn't keep the app's cookie, so it can't sign you in here. Allow cookies for this site and try again.",
        400,
      );
    }
    if (!sameState(url.searchParams.get("state"), held)) {
      return text(
        "This sign-in didn't start in this browser. Open the app again.",
        400,
      );
    }
    const token = url.searchParams.get("token");
    let value = `${signedOutPrefix}${String(nowSeconds())}`;
    if (token !== null) {
      let read;
      try {
        read = await readAppToken(verifyKey, token, new Date(), app);
      } catch (error) {
        return unavailable("core-key", error, errors.keys);
      }
      if (!read) {
        return text("Core's token for this app doesn't check out.", 400);
      }
      if (read.expired) {
        return text(
          "The token core just issued has already expired by this app's clock. Check that the app's clock agrees with core's.",
          503,
        );
      }
      value = token;
    }
    return redirect(next, [
      ["set-cookie", cookie(sessionCookie, value, appCookieMaxAgeSeconds)],
      ["referrer-policy", "no-referrer"],
    ]);
  };

  /** What the app's own cookie says about who is asking. */
  const sessionOf = async (request: Request): Promise<SessionState> => {
    let saidSignedOut: number | undefined;
    for (const value of sessionTokensIn(request.headers.get("cookie"))) {
      const at = signedOutAt(value);
      if (at !== undefined) {
        saidSignedOut = Math.max(at, saidSignedOut ?? at);
        continue;
      }
      const read = await readAppToken(verifyKey, value, new Date(), app);
      if (!read) continue;
      if (read.expired) return { state: "expired" };
      const viewer =
        read.kind === "owner"
          ? { kind: read.kind, id: read.id }
          : { kind: read.kind, id: read.id, roles: read.roles };
      return { state: "signed-in", viewer };
    }
    const age = saidSignedOut === undefined ? -1 : nowSeconds() - saidSignedOut;
    if (age >= 0 && age < signedOutSeconds) return { state: "signed-out" };
    return isBrowserNavigation(request)
      ? { state: "unknown" }
      : { state: "signed-out" };
  };

  return async (request) => {
    const url = publicUrl(request);
    if (url.pathname === appSessionPath) {
      return { response: await arrive(request, url) };
    }
    if (url.pathname === appRefreshPath) {
      const next = nextOn(url);
      return {
        response: next ? toCore(request, next) : text(errors.next, 400),
      };
    }

    let session: SessionState;
    try {
      session = await sessionOf(request);
    } catch (error) {
      // Not knowing who is asking isn't the same as nobody asking, so the
      // browser isn't sent to log in.
      return { response: unavailable("core-key", error, errors.keys) };
    }
    let rule: AccessRule;
    try {
      rule = await ruleOf();
    } catch (error) {
      return {
        response: unavailable(
          "access-rule",
          error,
          "Can't reach core to check who may open this app.",
        ),
      };
    }
    const decision = guard(rule, session);
    switch (decision.outcome) {
      case "allow":
        return { viewer: decision.viewer };
      case "not-found":
        return { response: text("Not found", 404) };
      case "login": {
        // Core's word that nobody is signed in goes, so once the browser
        // signs in at the hub and comes back, the app asks core again.
        const forget = cookie(sessionCookie, "", 0);
        const location = new URL("/", hub);
        if (!isNavigation(request)) {
          // A call doesn't know the page it came from. The page adds next.
          const response = sessionLapsedResponse({
            outcome: "login",
            error: errors.login,
            location: location.href,
          });
          response.headers.append("set-cookie", forget);
          return { response };
        }
        location.searchParams.set("next", url.href);
        return { response: redirect(location.href, [["set-cookie", forget]]) };
      }
      case "refresh":
        if (!isNavigation(request)) {
          return {
            response: sessionLapsedResponse({
              outcome: "refresh",
              error: errors.refresh,
              location: new URL(appRefreshPath, url).href,
            }),
          };
        }
        return { response: toCore(request, url.href) };
    }
  };
}
