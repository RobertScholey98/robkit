import { Hono, type Context } from "hono";
import { validator } from "hono/validator";
import { appSessionUrl, sessionTokensIn } from "@robkit/session";
import { install, isLocal } from "@robkit/session/addresses";
import { isProblem } from "@robkit/input";
import { parseAccessCode } from "../access-codes.ts";
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

function tooManyAttempts(c: Context, retryAfter: number): Response {
  const minutes = Math.ceil(retryAfter / 60);
  const wait = minutes === 1 ? "1 minute" : `${String(minutes)} minutes`;
  c.header("Retry-After", String(retryAfter));
  return c.json({ error: `Too many attempts. Try again in ${wait}.` }, 429);
}

/**
 * Signing in and out, who is signed in, and the tokens core mints for each
 * app with the keys that check them.
 */
export function sessionRoutes(context: RouteContext): Hono<CoreEnv> {
  const { domain, now, signingKey, trustedProxy } = context;
  const routes = new Hono<CoreEnv>();
  const addresses = install({ domain });
  const loginLimiter = createRateLimiter({
    limit: 5,
    windowMs: 15 * 60 * 1000,
    now,
  });
  // Apart from the owner's limit, so a guest guessing codes can't lock the
  // owner out. A guest's sign-in never clears it, or one live code would buy
  // endless guesses at the others.
  const codeLimiter = createRateLimiter({
    limit: 10,
    windowMs: 15 * 60 * 1000,
    now,
  });

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
  routes.get(
    "/refresh",
    validator("query", (_, c) => {
      const next = addresses.onInstall(c.req.query("next"));
      const slug = next && addresses.appOf(next);
      // A token in a URL goes only over https, but on a local install.
      const safe = isLocal(domain) || next?.startsWith("https:");
      if (!next || !slug || !safe || slug === "core" || slug === "hub") {
        return c.json(
          { error: "Send next, a URL on one of this install's apps." },
          400,
        );
      }
      return { next, slug, state: c.req.query("state") };
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
    setSessionCookie(c, domain, claim.sessionToken);
    return c.json<SessionAnswer>(
      { state: "signed-in", profile: claim.profile },
      201,
    );
  });

  routes.post("/login", async (c) => {
    const credentials = await readBody(c, readCredentials);
    if (isProblem(credentials)) return c.json(credentials, 400);

    const client = clientOf(c, trustedProxy);
    const retryAfter = loginLimiter.retryAfter(client);
    if (retryAfter > 0) return tooManyAttempts(c, retryAfter);

    const result = await signIn(
      context,
      credentials.username,
      credentials.password,
    );
    if (result.outcome === "unclaimed") {
      return c.json(
        { error: "This install has no owner yet. Set it up first." },
        409,
      );
    }
    if (result.outcome === "wrong") {
      loginLimiter.fail(client);
      return c.json({ error: "Wrong username or password." }, 401);
    }
    loginLimiter.clear(client);
    setSessionCookie(c, domain, result.sessionToken);
    return c.json<SessionAnswer>({
      state: "signed-in",
      profile: result.profile,
    });
  });

  routes.post("/login/code", async (c) => {
    const fields = await fieldsOf(c);
    if (typeof fields?.code !== "string") {
      return c.json({ error: "Send a code." }, 400);
    }
    const client = clientOf(c, trustedProxy);
    const retryAfter = codeLimiter.retryAfter(client);
    if (retryAfter > 0) return tooManyAttempts(c, retryAfter);

    const code = parseAccessCode(fields.code);
    const result = code
      ? await signInWithCode(context, code)
      : { outcome: "refused" as const };
    if (result.outcome === "unclaimed") {
      return c.json(
        { error: "This install has no owner yet. Set it up first." },
        409,
      );
    }
    if (result.outcome === "refused") {
      codeLimiter.fail(client);
      return c.json({ error: "That code doesn't work." }, 401);
    }
    setSessionCookie(c, domain, result.sessionToken);
    return c.json<SessionAnswer>({
      state: "signed-in",
      profile: result.profile,
    });
  });

  // The hub sends no body here, so none is read.
  routes.post("/logout", async (c) => {
    await signOut(context, sessionTokensIn(c.req.header("cookie")));
    setSessionCookie(c, domain, "", 0);
    return c.body(null, 204);
  });

  return routes;
}
