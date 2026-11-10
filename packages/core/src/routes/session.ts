import { Hono, type Context } from "hono";
import { validator } from "hono/validator";
import { appSessionUrl, sessionTokensIn } from "@robkit/session";
import { isPlatformApp, isProblem, type Slug } from "@robkit/input";
import { parseAccessCode } from "../access-codes.ts";
import { accessOf } from "../apps.ts";
import { clientOf } from "../client.ts";
import { claimInstall, readCredentials, readNewOwner } from "../owner.ts";
import { createRateLimiter } from "../rate-limit.ts";
import { mintAppToken } from "../mint-token.ts";
import {
  signIn,
  signInWithCode,
  signOut,
  type SessionAnswer,
} from "../session-store.ts";
import {
  fieldsOf,
  readBody,
  setSessionCookie,
  viewer,
  type CoreEnv,
  type RouteContext,
} from "./context.ts";

/** `count` of `unit`, as a person reads it: "1 second", "15 minutes". */
function plural(count: number, unit: string): string {
  return count === 1 ? `1 ${unit}` : `${String(count)} ${unit}s`;
}

/**
 * A 429 that says when to come back, in at least 1 second. A wait under a
 * minute reads in seconds, so a 1-second wait doesn't say "1 minute".
 */
function tooManyAttempts(c: Context, retryAfter: number): Response {
  const seconds = Math.max(1, retryAfter);
  const wait =
    seconds < 60
      ? plural(seconds, "second")
      : plural(Math.ceil(seconds / 60), "minute");
  c.header("Retry-After", String(seconds));
  return c.json({ error: `Too many attempts. Try again in ${wait}.` }, 429);
}

function unclaimed(c: Context): Response {
  return c.json(
    { error: "This install has no owner yet. Set it up first." },
    409,
  );
}

/**
 * Signing in and out, who is signed in, and the tokens core mints for each
 * app with the keys that check them.
 */
export function sessionRoutes(context: RouteContext): Hono<CoreEnv> {
  const { db, install, now, signingKey, signInLimits, trustedProxy } = context;
  const origin = install.origin("core");
  const routes = new Hono<CoreEnv>();
  const loginLimiter = createRateLimiter({
    limit: signInLimits.passwordsPerClient,
    windowMs: signInLimits.clientWindowMs,
    now,
  });
  // Apart from the owner's limit, so a guest guessing codes can't lock the
  // owner out. A guest's sign-in frees only its own place and never clears
  // the client's failures, or one live code would buy endless guesses at the
  // others.
  const codeLimiter = createRateLimiter({
    limit: signInLimits.codesPerClient,
    windowMs: signInLimits.clientWindowMs,
    now,
  });

  /**
   * Whether core mints `slug` a token: admin, or an app in core's catalog.
   * Never the hub or core, which take none.
   */
  async function mintsFor(slug: Slug): Promise<boolean> {
    if (isPlatformApp(slug)) return slug === "admin";
    return (await accessOf(db, slug)) !== undefined;
  }

  routes.get("/.well-known/jwks.json", async (c) => {
    const { kid, publicJwk } = await signingKey();
    return c.json({ keys: [{ ...publicJwk, kid, alg: "EdDSA", use: "sig" }] });
  });

  routes.get("/session", viewer(context), (c) =>
    c.json<SessionAnswer>(c.var.session.answer),
  );

  // An app's guard sends the browser here when it holds no live token of
  // its own. Core reads its own cookie, never anything the app holds, and
  // sends the browser straight back to the app's callback with a token
  // minted for that app alone, or none if nobody is signed in. The app's
  // guard then decides whether to send the browser to log in. Core's own
  // token is reissued too, even if core thinks it live.
  //
  // `next` must be on the exact origin of an app core mints for, protocol
  // and port included. Core's origin is https unless the install is local,
  // so a token in a URL goes only over https, but on a local install.
  routes.get(
    "/refresh",
    validator("query", async (_, c) => {
      const next = c.req.query("next");
      const slug = next === undefined ? undefined : install.appAt(next);
      if (!next || !slug || !(await mintsFor(slug))) {
        return c.json(
          { error: "Send next, a URL on one of this install's apps." },
          400,
        );
      }
      return { next: new URL(next).href, slug, state: c.req.query("state") };
    }),
    viewer(context, { renew: true }),
    async (c) => {
      const { next, slug, state } = c.req.valid("query");
      const { forGuard } = c.var.session;
      const token =
        forGuard.state === "signed-in"
          ? await mintAppToken(await signingKey(), forGuard.viewer, slug, now())
          : undefined;
      c.header("Cache-Control", "no-store");
      c.header("Referrer-Policy", "no-referrer");
      return c.redirect(appSessionUrl(next, { token, state }), 302);
    },
  );

  routes.post("/setup", async (c) => {
    const credentials = await readBody(c, readNewOwner);
    if (isProblem(credentials)) return c.json(credentials, 400);

    const claim = await claimInstall(
      context,
      credentials.username,
      credentials.password,
    );
    if (claim.outcome === "taken") {
      return c.json({ error: "This install already has an owner." }, 409);
    }
    setSessionCookie(c, origin, claim.sessionToken);
    return c.json<SessionAnswer>(
      { state: "signed-in", profile: claim.profile },
      201,
    );
  });

  routes.post("/login", async (c) => {
    const credentials = await readBody(c, readCredentials);
    if (isProblem(credentials)) return c.json(credentials, 400);

    const client = clientOf(c, trustedProxy);
    const reservation = loginLimiter.reserve(client);
    if (reservation.outcome === "refused") {
      return tooManyAttempts(c, reservation.retryAfter);
    }
    const { place } = reservation;
    // Released on every path but a wrong password, which records it, so a
    // check that throws leaks no place.
    try {
      const result = await signIn(
        context,
        credentials.username,
        credentials.password,
      );
      if (result.outcome === "unclaimed") return unclaimed(c);
      if (result.outcome === "wrong") {
        place.fail();
        return c.json({ error: "Wrong username or password." }, 401);
      }
      loginLimiter.clear(client);
      setSessionCookie(c, origin, result.sessionToken);
      return c.json<SessionAnswer>({
        state: "signed-in",
        profile: result.profile,
      });
    } finally {
      place.release();
    }
  });

  routes.post("/login/code", async (c) => {
    const fields = await fieldsOf(c);
    if (isProblem(fields) || typeof fields.code !== "string") {
      return c.json({ error: "Send a code." }, 400);
    }
    const client = clientOf(c, trustedProxy);
    const reservation = codeLimiter.reserve(client);
    if (reservation.outcome === "refused") {
      return tooManyAttempts(c, reservation.retryAfter);
    }
    const { place } = reservation;
    try {
      const code = parseAccessCode(fields.code);
      const result = code
        ? await signInWithCode(context, code)
        : { outcome: "refused" as const };
      if (result.outcome === "unclaimed") return unclaimed(c);
      if (result.outcome === "refused") {
        place.fail();
        return c.json({ error: "That code doesn't work." }, 401);
      }
      setSessionCookie(c, origin, result.sessionToken);
      return c.json<SessionAnswer>({
        state: "signed-in",
        profile: result.profile,
      });
    } finally {
      place.release();
    }
  });

  // The hub sends no body here, so none is read.
  routes.post("/logout", async (c) => {
    await signOut(context, sessionTokensIn(c.req.header("cookie"), origin));
    setSessionCookie(c, origin, "", 0);
    return c.body(null, 204);
  });

  return routes;
}
