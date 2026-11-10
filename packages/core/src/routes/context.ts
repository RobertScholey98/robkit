import type { Context, MiddlewareHandler } from "hono";
import { setCookie } from "hono/cookie";
import type { Report } from "@robkit/input/report";
import { sessionCookies, sessionTokensIn } from "@robkit/session";
import { type InputProblem, isProblem, isRecord, problem } from "@robkit/input";
import type { TrustedProxy } from "../client.ts";
import type { SignInLimits } from "../sign-in-limits.ts";
import { sessionLifetimeSeconds } from "../session-claims.ts";
import {
  readSession,
  type SessionContext,
  type SessionRead,
} from "../session-store.ts";

/** What each routes module takes from `createApp`. */
export interface RouteContext extends SessionContext {
  trustedProxy: TrustedProxy | undefined;
  logError: Report;
  signInLimits: SignInLimits;
}

/** What a route that needs the viewer finds in `c.var`. */
export interface CoreEnv {
  Variables: { session: SessionRead };
}

type Fields = Record<string, unknown>;

/** The fields of the JSON object a POST sent, or why it isn't one. */
export async function fieldsOf(c: Context): Promise<Fields | InputProblem> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    // A body that isn't JSON is the caller's mistake, answered with a 400.
    return problem("Send a valid JSON body.");
  }
  return isRecord(body) ? body : problem("Send a JSON object.");
}

/** A POST's JSON fields read by one of core's input rules, or why they won't do. */
export async function readBody<T>(
  c: Context,
  read: (fields: Fields) => T | InputProblem,
): Promise<T | InputProblem> {
  const fields = await fieldsOf(c);
  return isProblem(fields) ? fields : read(fields);
}

/**
 * Puts `sessionToken` on the cookie of the core at `origin`, or clears it
 * with a `maxAge` of 0.
 */
export function setSessionCookie(
  c: Context,
  origin: string,
  sessionToken: string,
  maxAge = sessionLifetimeSeconds,
): void {
  // Host-only, with no Domain, so only core's host ever receives it, and
  // __Host- over https, so no sibling can plant one. The hub and admin call
  // core from the browser, so it goes with those calls.
  const { session, attributes } = sessionCookies(origin);
  setCookie(c, session, sessionToken, { ...attributes, maxAge });
}

/**
 * Reads who is asking from core's own cookie into `c.var.session`, for
 * every route that needs the viewer, and puts a live session's fresh token
 * on the answer's cookie. With `renew`, as `/refresh` asks, a live
 * session's token is reissued even if it hasn't expired, and the cookie of
 * a session that ended is cleared. With `ownerOnly`, for the routes admin
 * manages the install through over CORS, anyone but the owner is told there
 * is nothing here, with no fresh cookie, as a route that doesn't exist
 * would answer.
 */
export function viewer(
  context: RouteContext,
  { renew = false, ownerOnly = false } = {},
): MiddlewareHandler<CoreEnv> {
  return async function readViewer(c, next) {
    const origin = context.install.origin("core");
    const sessionTokens = sessionTokensIn(c.req.header("cookie"), origin);
    const session = await readSession(context, sessionTokens, { renew });
    const { answer, freshSessionToken } = session;
    const isOwner =
      answer.state === "signed-in" && answer.profile.kind === "owner";
    if (ownerOnly && !isOwner) return c.json({ error: "Not found" }, 404);
    if (freshSessionToken) {
      setSessionCookie(c, origin, freshSessionToken);
    } else if (
      renew &&
      sessionTokens.length > 0 &&
      answer.state !== "signed-in"
    ) {
      setSessionCookie(c, origin, "", 0);
    }
    c.set("session", session);
    await next();
  };
}
