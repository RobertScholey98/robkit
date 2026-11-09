import { randomBytes, timingSafeEqual } from "node:crypto";
import type { SessionState } from "@robkit/guard";
import type { Slug } from "@robkit/input";
import { appRefreshPath, appSessionPath } from "./app-session.ts";
import { coreKeys } from "./core-keys.ts";
import {
  hostOnlyCookie,
  isBrowserNavigation,
  nextOn,
  redirect,
  text,
} from "./guard-http.ts";
import type { SessionCookies } from "./session-cookies.ts";
import { cookieValues, readAppToken } from "./session-token.ts";

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

const nextNotOnApp = "next must be a page on this app.";

const nowSeconds = () => Math.floor(Date.now() / 1000);

/** When core said nobody is signed in, if the cookie holds that. */
function signedOutAt(value: string): number | undefined {
  if (!value.startsWith(signedOutPrefix)) return undefined;
  const at = Number(value.slice(signedOutPrefix.length));
  return Number.isSafeInteger(at) ? at : undefined;
}

function sameState(sent: string | null, held: string): boolean {
  if (sent === null) return false;
  const [a, b] = [Buffer.from(sent), Buffer.from(held)];
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface RefreshProtocolOptions {
  /** The app's slug: the only audience its tokens may have. */
  app: Slug;
  /** Core's origin, where the browser goes for the app's token. */
  core: string;
  /**
   * The app's cookies: the session cookie that holds its token, or core's
   * word that nobody is signed in, and the state cookie that holds the
   * state it sent core until core comes back.
   */
  cookies: SessionCookies;
  /** The guard's 503 for a token it couldn't check against core's key. */
  keyUnavailable: (cause: unknown) => Response;
}

/**
 * How an app gets and keeps its token: the trip through core's `/refresh`
 * and back to the app's callback, with the state that ties the two
 * together, and the app's own cookie that holds the token, or core's word
 * that nobody is signed in.
 */
export function refreshProtocol({
  app,
  core,
  cookies,
  keyUnavailable,
}: RefreshProtocolOptions) {
  const verifyKey = coreKeys(core);

  const cookie = (name: string, value: string, maxAge: number) =>
    hostOnlyCookie(name, value, maxAge, cookies.attributes);

  /** The state this browser holds for a trip through core, if any. */
  const stateIn = (request: Request): string | undefined =>
    cookieValues(request.headers.get("cookie"), cookies.state).find((value) =>
      /^[\w-]{43}$/.test(value),
    );

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
      ["set-cookie", cookie(cookies.state, state, stateMaxAgeSeconds)],
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
    if (!next) return text(nextNotOnApp, 400);
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
        return keyUnavailable(error);
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
      ["set-cookie", cookie(cookies.session, value, appCookieMaxAgeSeconds)],
      ["referrer-policy", "no-referrer"],
    ]);
  };

  return {
    toCore,

    /** A `Set-Cookie` that forgets core's word that nobody is signed in. */
    forget: cookie(cookies.session, "", 0),

    /**
     * The answer to a request for one of the guard's own paths: the
     * callback where core hands the app its token, and the refresh path a
     * call from the page sends the browser to. Undefined for any other.
     */
    async answer(request: Request, url: URL): Promise<Response | undefined> {
      if (url.pathname === appSessionPath) return arrive(request, url);
      if (url.pathname !== appRefreshPath) return undefined;
      const next = nextOn(url);
      return next ? toCore(request, next) : text(nextNotOnApp, 400);
    },

    /** What the app's own cookie says about who is asking. */
    async sessionOf(request: Request): Promise<SessionState> {
      let saidSignedOut: number | undefined;
      for (const value of cookieValues(
        request.headers.get("cookie"),
        cookies.session,
      )) {
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
      const age =
        saidSignedOut === undefined ? -1 : nowSeconds() - saidSignedOut;
      if (age >= 0 && age < signedOutSeconds) return { state: "signed-out" };
      return isBrowserNavigation(request)
        ? { state: "unknown" }
        : { state: "signed-out" };
    },
  };
}
