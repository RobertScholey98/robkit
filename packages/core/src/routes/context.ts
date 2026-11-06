import type { Context, MiddlewareHandler } from "hono";
import { setCookie } from "hono/cookie";
import type { Report } from "@robkit/input/report";
import { sessionCookie, sessionTokensIn } from "@robkit/session";
import { isLocal } from "@robkit/input/addresses";
import { type InputProblem, isProblem, isRecord } from "@robkit/input";
import type { TrustedProxy } from "../client.ts";
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
    return { error: "Send a valid JSON body." };
  }
  return isRecord(body) ? body : { error: "Send a JSON object." };
}

/** A POST's JSON fields read by one of core's input rules, or why they won't do. */
export async function readBody<T>(
  c: Context,
  read: (fields: Fields) => T | InputProblem,
): Promise<T | InputProblem> {
  const fields = await fieldsOf(c);
  return isProblem(fields) ? fields : read(fields);
}

/** Puts `sessionToken` on core's cookie, or clears it with a `maxAge` of 0. */
export function setSessionCookie(
  c: Context,
  domain: string,
  sessionToken: string,
  maxAge = sessionLifetimeSeconds,
): void {
  // Host-only, with no Domain, so only core's host ever receives it. The
  // hub and admin call core from the browser, so it goes with those calls.
  setCookie(c, sessionCookie, sessionToken, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    maxAge,
    secure: !isLocal(domain),
  });
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
    const sessionTokens = sessionTokensIn(c.req.header("cookie"));
    const session = await readSession(context, sessionTokens, { renew });
    const { answer, freshSessionToken } = session;
    const isOwner =
      answer.state === "signed-in" && answer.profile.kind === "owner";
    if (ownerOnly && !isOwner) return c.json({ error: "Not found" }, 404);
    if (freshSessionToken) {
      setSessionCookie(c, context.domain, freshSessionToken);
    } else if (
      renew &&
      sessionTokens.length > 0 &&
      answer.state !== "signed-in"
    ) {
      setSessionCookie(c, context.domain, "", 0);
    }
    c.set("session", session);
    await next();
  };
}
