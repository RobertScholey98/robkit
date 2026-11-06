import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { validator } from "hono/validator";
import { readCodeId, readRoleId } from "@robkit/guard";
import {
  appSessionUrl,
  reportToConsole,
  sessionCookie,
  sessionTokensIn,
  type Report,
} from "@robkit/session";
import { install, isLocal, platformApps } from "@robkit/session/addresses";
import { isProblem, isRecord, type InputProblem } from "@robkit/session/input";
import {
  listCodes,
  mintCode,
  revokeCode,
  parseAccessCode,
  readNewCode,
} from "./access-codes.ts";
import { clientOf, type TrustedProxy } from "./client.ts";
import type { Database } from "./database.ts";
import {
  accessOf,
  launcherApps,
  listApps,
  readAccess,
  setAccess,
} from "./apps.ts";
import { claimInstall, readCredentials, readNewOwner } from "./owner.ts";
import { createRateLimiter } from "./rate-limit.ts";
import {
  createRole,
  listRoles,
  readCodeIds,
  readNewRole,
  setRoleCodes,
} from "./roles.ts";
import {
  readSession,
  signOut,
  sessionLifetimeSeconds,
  type SessionAnswer,
  type SessionContext,
  type SessionRead,
  signIn,
  signInWithCode,
} from "./sessions.ts";
import { mintAppToken } from "./mint-token.ts";
import { ensureSigningKey, type SigningKey } from "./signing-key.ts";

export interface CoreOptions {
  db: Database;
  /** The install's domain, such as `robkit.localhost` in development. */
  domain: string;
  /** Core's clock, for token times, session expiry and rate limits. */
  now?: () => Date;
  /**
   * A proxy further out that names each visitor, such as Cloudflare in front
   * of a tunnel. Set only when nothing else can reach the host.
   */
  trustedProxy?: TrustedProxy | undefined;
  /**
   * Where core reports what it can't answer usefully: an unexpected error in
   * a route, or the database being unreachable. Defaults to
   * `reportToConsole`.
   */
  logError?: Report;
}

/** What a route that needs the viewer finds in `c.var`. */
interface CoreEnv {
  Variables: { session: SessionRead };
}

/** The platform apps that call core from the browser with the session cookie. */
const trustedApps = platformApps.filter((slug) => slug !== "core");

function hostnameOf(origin: string): string | undefined {
  try {
    return new URL(origin).hostname;
  } catch {
    // An Origin that isn't a URL names no host, so CORS refuses it.
    return undefined;
  }
}

function isJson(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

type Fields = Record<string, unknown>;

/** The fields of the JSON object a POST sent, or undefined if it isn't JSON. */
async function fieldsOf(c: Context): Promise<Fields | undefined> {
  try {
    const body: unknown = await c.req.json();
    return isRecord(body) ? body : {};
  } catch {
    // A body that isn't JSON is the caller's mistake, answered with a 400.
    return undefined;
  }
}

/** A POST's JSON fields read by one of core's input rules, or why they won't do. */
async function readBody<T>(
  c: Context,
  read: (fields: Fields) => T | InputProblem,
): Promise<T | InputProblem> {
  const fields = await fieldsOf(c);
  return fields ? read(fields) : { error: "Send a valid JSON body." };
}

const unknownCode = "One of those codes doesn't exist.";

function tooManyAttempts(c: Context, retryAfter: number): Response {
  const minutes = Math.ceil(retryAfter / 60);
  const wait = minutes === 1 ? "1 minute" : `${String(minutes)} minutes`;
  c.header("Retry-After", String(retryAfter));
  return c.json({ error: `Too many attempts. Try again in ${wait}.` }, 429);
}

/** Caches a load once it succeeds; a failed load is tried again next call. */
function memoize<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () =>
    (pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    }));
}

export function createApp({
  db,
  domain,
  now = () => new Date(),
  trustedProxy,
  logError = reportToConsole,
}: CoreOptions): Hono {
  const app = new Hono();
  // Hono's own answer to a route that throws. The cause stays in core's log
  // and the caller gets a generic error, with a request id that finds the
  // log line.
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    const requestId = randomUUID();
    logError(
      `${c.req.method} ${c.req.path} failed (request ${requestId}).`,
      error,
    );
    return c.json(
      {
        error: `Core hit an unexpected error. Look for request ${requestId} in core's log to see what went wrong.`,
        requestId,
      },
      500,
      { "X-Request-Id": requestId },
    );
  });
  const addresses = install({ domain });
  const signingKey: () => Promise<SigningKey> = memoize(() =>
    ensureSigningKey(db),
  );
  const ctx: SessionContext = { db, domain, now, signingKey };
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

  const setSessionCookie = (
    c: Context,
    sessionToken: string,
    maxAge = sessionLifetimeSeconds,
  ) => {
    // Host-only, with no Domain, so only core's host ever receives it. The
    // hub and admin call core from the browser, so it goes with those calls.
    setCookie(c, sessionCookie, sessionToken, {
      httpOnly: true,
      path: "/",
      sameSite: "Lax",
      maxAge,
      secure: !isLocal(domain),
    });
  };

  /**
   * Reads who is asking from core's own cookie into `c.var.session`, for
   * every route that needs the viewer, and puts a live session's fresh token
   * on the answer's cookie. With `renew`, as `/refresh` asks, a live
   * session's token is reissued even if it hasn't expired, and the cookie of
   * a session that ended is cleared. With `ownerOnly`, anyone but the owner
   * is told there is nothing here, with no fresh cookie, as a route that
   * doesn't exist would answer.
   */
  const viewer = ({
    renew = false,
    ownerOnly = false,
  } = {}): MiddlewareHandler<CoreEnv> =>
    async function readViewer(c, next) {
      const sessionTokens = sessionTokensIn(c.req.header("cookie"));
      const session = await readSession(ctx, sessionTokens, { renew });
      const { answer, freshSessionToken } = session;
      const isOwner =
        answer.state === "signed-in" && answer.viewer.kind === "owner";
      if (ownerOnly && !isOwner) return c.json({ error: "Not found" }, 404);
      if (freshSessionToken) setSessionCookie(c, freshSessionToken);
      else if (
        renew &&
        sessionTokens.length > 0 &&
        answer.state !== "signed-in"
      ) {
        setSessionCookie(c, "", 0);
      }
      c.set("session", session);
      await next();
    };
  // Admin manages the install over CORS with the owner's cookie.
  const owner = viewer({ ownerOnly: true });

  const trustedHosts = new Set(trustedApps.map((slug) => addresses.host(slug)));

  app.use(
    cors({
      origin: (origin) => {
        const hostname = hostnameOf(origin);
        return hostname !== undefined && trustedHosts.has(hostname)
          ? origin
          : null;
      },
      credentials: true,
    }),
  );

  // A JSON content type makes every cross-origin POST preflight, so only the
  // hub and admin can send one with the owner's cookie.
  app.on("POST", "*", async (c, next) => {
    if (!isJson(c.req.header("content-type"))) {
      return c.json({ error: "Send JSON." }, 415);
    }
    await next();
  });
  app.on(
    "POST",
    "*",
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json({ error: "Send at most 16 KiB." }, 413),
    }),
  );

  app.get("/status", async (c) => {
    try {
      await db.execute(sql`select 1`);
    } catch (error) {
      logError(
        `${c.req.method} ${c.req.path}: the database is unreachable. Check DATABASE_URL and that Postgres is running.`,
        error,
      );
      return c.json({ status: "unavailable" }, 503);
    }
    return c.json({ status: "ok" });
  });

  app.get("/.well-known/jwks.json", async (c) => {
    const { kid, publicJwk } = await signingKey();
    return c.json({ keys: [{ ...publicJwk, kid, alg: "EdDSA", use: "sig" }] });
  });

  app.get("/session", viewer(), (c) =>
    c.json<SessionAnswer>(c.var.session.answer),
  );

  // An app's guard sends the browser here when it holds no live token of
  // its own. Core reads its own cookie, never anything the app holds, and
  // sends the browser straight back to the app's callback with a token
  // minted for that app alone, or none if nobody is signed in. The app's
  // guard then decides whether to send the browser to log in. Core's own
  // token is reissued too, even if core thinks it live.
  app.get(
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
    viewer({ renew: true }),
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

  app.post("/setup", async (c) => {
    const credentials = await readBody(c, readNewOwner);
    if (isProblem(credentials)) return c.json(credentials, 400);

    const claim = await claimInstall(
      ctx,
      credentials.username,
      credentials.password,
    );
    if (claim.outcome === "taken") {
      return c.json({ error: "This install already has an owner." }, 409);
    }
    setSessionCookie(c, claim.sessionToken);
    return c.json<SessionAnswer>(
      { state: "signed-in", viewer: claim.viewer },
      201,
    );
  });

  app.post("/login", async (c) => {
    const credentials = await readBody(c, readCredentials);
    if (isProblem(credentials)) return c.json(credentials, 400);

    const client = clientOf(c, trustedProxy);
    const retryAfter = loginLimiter.retryAfter(client);
    if (retryAfter > 0) return tooManyAttempts(c, retryAfter);

    const result = await signIn(
      ctx,
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
    setSessionCookie(c, result.sessionToken);
    return c.json<SessionAnswer>({ state: "signed-in", viewer: result.viewer });
  });

  app.post("/login/code", async (c) => {
    const fields = await fieldsOf(c);
    if (typeof fields?.code !== "string") {
      return c.json({ error: "Send a code." }, 400);
    }
    const client = clientOf(c, trustedProxy);
    const retryAfter = codeLimiter.retryAfter(client);
    if (retryAfter > 0) return tooManyAttempts(c, retryAfter);

    const code = parseAccessCode(fields.code);
    const result = code
      ? await signInWithCode(ctx, code)
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
    setSessionCookie(c, result.sessionToken);
    return c.json<SessionAnswer>({ state: "signed-in", viewer: result.viewer });
  });

  // The hub sends no body here, so none is read.
  app.post("/logout", async (c) => {
    await signOut(ctx, sessionTokensIn(c.req.header("cookie")));
    setSessionCookie(c, "", 0);
    return c.body(null, 204);
  });

  app.get("/codes", owner, async (c) =>
    c.json({ codes: await listCodes(db, now(), domain) }),
  );

  app.post("/codes", owner, async (c) => {
    const at = now();
    const request = await readBody(c, (fields) => readNewCode(fields, at));
    if (isProblem(request)) return c.json(request, 400);
    const mint = await mintCode(db, request, at, domain);
    if (mint.outcome === "taken") {
      return c.json({ error: "That code is taken." }, 409);
    }
    return c.json(mint.code, 201);
  });

  app.post("/codes/:id/revoke", owner, async (c) => {
    const id = readCodeId(c.req.param("id"));
    if (!id || !(await revokeCode(db, id, now()))) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.body(null, 204);
  });

  app.get("/launcher", viewer(), async (c) =>
    c.json({ apps: await launcherApps(db, c.var.session.forGuard) }),
  );

  // Each app's adapter reads its own rule here, with no cookie, so it's open
  // to anyone.
  app.get("/apps/:slug/access", async (c) => {
    const access = await accessOf(db, c.req.param("slug"));
    return access ? c.json(access) : c.json({ error: "Not found" }, 404);
  });

  app.get("/apps", owner, async (c) => c.json({ apps: await listApps(db) }));

  app.post("/apps/:slug/access", owner, async (c) => {
    const rule = await readBody(c, readAccess);
    if (isProblem(rule)) return c.json(rule, 400);
    const change = await setAccess(db, c.req.param("slug"), rule);
    switch (change.outcome) {
      case "unknown-app":
        return c.json({ error: "Not found" }, 404);
      case "unknown-role":
        return c.json({ error: "One of those roles doesn't exist." }, 400);
      case "changed":
        return c.json(change.access);
    }
  });

  app.get("/roles", owner, async (c) => c.json({ roles: await listRoles(db) }));

  app.post("/roles", owner, async (c) => {
    const request = await readBody(c, readNewRole);
    if (isProblem(request)) return c.json(request, 400);
    const creation = await createRole(db, request, now());
    switch (creation.outcome) {
      case "unknown-code":
        return c.json({ error: unknownCode }, 400);
      case "taken":
        return c.json({ error: "There's a role with that name." }, 409);
      case "created":
        return c.json(creation.role, 201);
    }
  });

  app.post("/roles/:id/codes", owner, async (c) => {
    const request = await readBody(c, readCodeIds);
    if (isProblem(request)) return c.json(request, 400);
    const roleId = readRoleId(c.req.param("id"));
    const change = roleId
      ? await setRoleCodes(db, roleId, request.codeIds)
      : { outcome: "unknown-role" as const };
    switch (change.outcome) {
      case "unknown-role":
        return c.json({ error: "Not found" }, 404);
      case "unknown-code":
        return c.json({ error: unknownCode }, 400);
      case "changed":
        return c.json(change.role);
    }
  });

  return app;
}
