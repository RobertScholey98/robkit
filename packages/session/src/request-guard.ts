import {
  guard,
  type AccessRule,
  type Decision,
  type SessionState,
  type Viewer,
} from "@robkit/guard";
import type { CoreOrigin, Slug } from "@robkit/input";
import { coreInstall, isLocal } from "@robkit/input/addresses";
import { appRefreshPath } from "./app-session.ts";
import {
  AccessRuleError,
  coreAccess,
  type AccessRuleFailure,
} from "./core-access.ts";
import { isNavigation, publicUrl, redirect, text } from "./guard-http.ts";
import { sessionLapsedResponse } from "./lapsed.ts";
import { CoreUnreachableError } from "./loopback-fetch.ts";
import { refreshProtocol } from "./refresh-protocol.ts";
import { reportToConsole } from "@robkit/input/report";

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
   * Core's public origin, such as `http://core.robkit.localhost:3000`, as
   * `readCoreUrl` read it. The hub is beside it on `hub.`. Config, never
   * the request's Host, so a request can't choose whose keys the app trusts.
   */
  core: CoreOrigin;
  /**
   * Hears why the guard answered 503 because it couldn't check a request.
   * By default it reports the app's slug, what failed and the cause through
   * `reportToConsole`.
   */
  onUnavailable?: ((fault: GuardFault) => void) | undefined;
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

/** What the app does with a request: serve it to the viewer, or answer it. */
export type RequestDecision = { viewer: Viewer } | { response: Response };

const errors = {
  login: "Sign in to use this app.",
  refresh: "Your session needs refreshing.",
  keys: "Can't reach core to check your session.",
  rule: "Can't reach core to check who may open this app.",
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
  const install = coreInstall(options.core);
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
    secure: !isLocal(install.domain),
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
        if (!isNavigation(request)) {
          // A call doesn't know the page it came from. The page adds next.
          const response = sessionLapsedResponse({
            outcome: "login",
            error: errors.login,
            location: location.href,
          });
          response.headers.append("set-cookie", protocol.forget);
          return response;
        }
        location.searchParams.set("next", url.href);
        return redirect(location.href, [["set-cookie", protocol.forget]]);
      }
      case "refresh":
        if (!isNavigation(request)) {
          return sessionLapsedResponse({
            outcome: "refresh",
            error: errors.refresh,
            location: new URL(appRefreshPath, url).href,
          });
        }
        return protocol.toCore(request, url.href);
    }
  };

  return async (request) => {
    const url = publicUrl(request);
    const own = await protocol.answer(request, url);
    if (own) return { response: own };

    let session: SessionState;
    try {
      session = await protocol.sessionOf(request);
    } catch (error) {
      // Not knowing who is asking isn't the same as nobody asking, so the
      // browser isn't sent to log in.
      return { response: keyUnavailable(error) };
    }
    let rule: AccessRule;
    try {
      rule = await ruleOf();
    } catch (error) {
      return { response: ruleUnavailable(error) };
    }
    const decision = guard(rule, session);
    if (decision.outcome === "allow") return { viewer: decision.viewer };
    return { response: respond(decision, request, url) };
  };
}
