import {
  guard,
  type AccessRule,
  type Decision,
  type SessionState,
  type Viewer,
} from "@robkit/guard";
import type { Slug } from "@robkit/input";
import { coreInstall } from "@robkit/input/addresses";
import { isRedirect, securityHeaders } from "@robkit/input/headers";
import { appRefreshPath } from "./app-session.ts";
import {
  AccessRuleError,
  coreAccess,
  type AccessRuleFailure,
} from "./core-access.ts";
import {
  formNotSent,
  isFormPost,
  isFromAnotherOrigin,
  isNavigation,
  publicUrl,
  redirect,
  text,
} from "./guard-http.ts";
import { readGuardSettings, type GuardSettings } from "./guard-settings.ts";
import { sessionLapsedResponse } from "./lapsed.ts";
import { CoreUnreachableError } from "./loopback-fetch.ts";
import { refreshProtocol } from "./refresh-protocol.ts";
import { sessionCookies } from "./session-cookies.ts";
import { reportToConsole } from "@robkit/input/report";

/**
 * How the guard runs. Every option may be left out: the guard reads the
 * app's slug and core's origin from `ROBKIT_APP` and `ROBKIT_CORE_URL`,
 * which `pnpm dev` and `robkit deploy` set, and ends the process with the
 * reader's message when one won't do.
 */
export interface GuardedOptions extends GuardSettings {
  /**
   * The app's slug, which is also its subdomain. The guard accepts only a
   * token core minted for this slug. `ROBKIT_APP` when left out.
   */
  app?: string | undefined;
  /**
   * A fixed rule, for an app core's catalog doesn't hold, such as admin.
   * Without one, the rule comes from core's catalog and is kept for a
   * minute, so a change in admin reaches the app within one.
   */
  access?: AccessRule | undefined;
  /**
   * Core's public origin, such as `https://core.robkit.dev`.
   * `ROBKIT_CORE_URL` when left out. The hub is beside it on `hub.`.
   * Config, never the request's Host, so a request can't choose whose keys
   * the app trusts. It is read as `ROBKIT_CORE_URL` is, so http is refused
   * on a domain that isn't local.
   */
  core?: string | undefined;
  /**
   * Hears why the guard answered 503 because it couldn't check a request.
   * By default it reports the app's slug, what failed and the cause through
   * `reportToConsole`.
   */
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
}

/**
 * The app's public origin, such as `https://notes.robkit.dev`: core's
 * protocol and port, on `<app>.<domain>`. It comes from the app's
 * settings, read as the guard reads them, never from a request's Host or
 * X-Forwarded-Proto.
 */
export function appOrigin(settings?: GuardSettings): string {
  const { app, core } = readGuardSettings(settings);
  return coreInstall(core).origin(app);
}

/**
 * Why the guard couldn't check a request, so answered 503 rather than
 * treating the viewer as signed out. `failed` says what failed: checking
 * the session against core's key, loading the app's access rule, or
 * reaching core at all. When core answered but not with the rule, `reason`
 * says how.
 */
export type GuardFault = {
  /** The app's slug. */
  app: Slug;
  /** The error behind it. */
  cause: unknown;
} & (
  | { failed: "core-key" | "network" }
  | { failed: "access-rule"; reason: AccessRuleFailure }
);

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

/**
 * What the app does with a request: serve it to the viewer, or answer it.
 * A served answer carries `headers`, whatever its status, where the app
 * set none of the same name: `X-Frame-Options: SAMEORIGIN`, `nosniff`,
 * and HSTS on an https install. The guard's own answer carries them
 * already, but for a redirect, which gets no framing header.
 */
export type RequestDecision =
  | {
      outcome: "serve";
      viewer: Viewer;
      headers: readonly [string, string][];
    }
  | { outcome: "answer"; response: Response };

const errors = {
  login: "Sign in to use this app.",
  refresh: "Your session needs refreshing.",
  keys: "Can't reach core to check your session.",
  rule: "Can't reach core to check who may open this app.",
  elsewhere:
    "This app only accepts changes from its own pages, and this request came from another origin.",
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
  options: GuardedOptions = {},
): (request: Request) => Promise<RequestDecision> {
  const { access, onUnavailable = reportFault } = options;
  const settings = readGuardSettings(options);
  const { app } = settings;
  const install = coreInstall(settings.core);
  const origin = install.origin(app);
  const core = install.origin("core");
  const hub = install.origin("hub");
  const ruleOf = access ? () => Promise.resolve(access) : coreAccess(core, app);

  /** A 503 for a check that failed, after telling `onUnavailable` why. */
  const unavailable = (fault: GuardFault, body: string): Response => {
    onUnavailable(fault);
    return text(body, 503);
  };
  const keyUnavailable = (cause: unknown) =>
    unavailable(
      {
        app,
        failed: cause instanceof CoreUnreachableError ? "network" : "core-key",
        cause,
      },
      errors.keys,
    );
  // coreAccess throws an AccessRuleError when core answered, and a
  // CoreUnreachableError when it didn't.
  const ruleUnavailable = (cause: unknown) =>
    unavailable(
      cause instanceof AccessRuleError
        ? { app, failed: "access-rule", reason: cause.failure, cause }
        : { app, failed: "network", cause },
      errors.rule,
    );

  const protocol = refreshProtocol({
    app,
    core,
    cookies: sessionCookies(origin),
    keyUnavailable,
  });

  /** The answer to a request the guard didn't let through. */
  const respond = (
    decision: Exclude<Decision, { outcome: "allow" }>,
    request: Request,
    url: URL,
  ): Response => {
    switch (decision.outcome) {
      case "not-found":
        return text("Not found", 404);
      case "login": {
        // Core's word that nobody is signed in goes, so once the browser
        // signs in at the hub and comes back, the app asks core again.
        const location = new URL("/", hub);
        if (isNavigation(request)) {
          location.searchParams.set("next", url.href);
          return redirect(location.href, [["set-cookie", protocol.forget]]);
        }
        // A call doesn't know the page it came from. The page adds next.
        const response = isFormPost(request)
          ? formNotSent(request, origin)
          : sessionLapsedResponse({
              outcome: "login",
              error: errors.login,
              location: location.href,
            });
        response.headers.append("set-cookie", protocol.forget);
        return response;
      }
      case "refresh":
        if (isNavigation(request)) return protocol.toCore(request, url.href);
        return isFormPost(request)
          ? formNotSent(request, origin)
          : sessionLapsedResponse({
              outcome: "refresh",
              error: errors.refresh,
              location: new URL(appRefreshPath, url).href,
            });
    }
  };

  const served = securityHeaders(origin, "same-origin");

  /** What the guard does with `request`: its own answer, or the viewer. */
  const decide = async (request: Request): Promise<Response | Viewer> => {
    // Before anything else, the guard's own paths included, so a page on
    // another origin can't act as the viewer.
    if (isFromAnotherOrigin(request, origin)) {
      return text(errors.elsewhere, 403);
    }
    const url = publicUrl(request, origin);
    const own = await protocol.answer(request, url);
    if (own) return own;

    let session: SessionState;
    try {
      session = await protocol.sessionOf(request);
    } catch (error) {
      // Not knowing who is asking isn't the same as nobody asking, so the
      // browser isn't sent to log in.
      return keyUnavailable(error);
    }
    let rule: AccessRule;
    try {
      rule = await ruleOf();
    } catch (error) {
      return ruleUnavailable(error);
    }
    const decision = guard(rule, session);
    if (decision.outcome === "allow") return decision.viewer;
    return respond(decision, request, url);
  };

  return async (request) => {
    const decided = await decide(request);
    if (!(decided instanceof Response)) {
      return { outcome: "serve", viewer: decided, headers: served };
    }
    // The guard builds every answer itself, so its headers can change.
    const framers = isRedirect(decided.status) ? undefined : "same-origin";
    for (const [name, value] of securityHeaders(origin, framers)) {
      decided.headers.set(name, value);
    }
    return { outcome: "answer", response: decided };
  };
}
