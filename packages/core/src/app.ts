import { sql } from "drizzle-orm";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { sessionCookie } from "@robkit/session";
import {
  listCodes,
  mintCode,
  revokeCode,
  parseAccessCode,
  type AccessCode,
  type NewCode,
} from "./access-codes.ts";
import type { Database } from "./database.ts";
import { isLocal } from "./domain.ts";
import { createRateLimiter } from "./rate-limit.ts";
import {
  claimInstall,
  readSession,
  signOut,
  sessionLifetimeSeconds,
  type SessionAnswer,
  type SessionContext,
  signIn,
  signInWithCode,
} from "./sessions.ts";
import { ensureSigningKey, type SigningKey } from "./signing-key.ts";

export interface CoreOptions {
  db: Database;
  /** The install's domain, such as `robkit.localhost` in development. */
  domain: string;
  /** Core's clock, for token times, session expiry and rate limits. */
  now?: () => Date;
}

/** The platform apps that call core from the browser with the session cookie. */
const trustedApps = ["hub", "admin"];

function hostnameOf(origin: string): string | undefined {
  try {
    return new URL(origin).hostname;
  } catch {
    return undefined;
  }
}

/** `next` if it is an http(s) URL on one of the install's subdomains. */
function appUrl(next: string | undefined, domain: string): string | undefined {
  if (next === undefined || !URL.canParse(next)) return undefined;
  const url = new URL(next);
  const web = url.protocol === "https:" || url.protocol === "http:";
  return web && url.hostname.endsWith(`.${domain}`) ? url.href : undefined;
}

function isJson(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

interface Credentials {
  username: string;
  password: string;
}

/** The fields of the JSON object a POST sent, or undefined if it isn't JSON. */
async function fieldsOf(
  c: Context,
): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await c.req.json();
    return typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return undefined;
  }
}

/** The username, trimmed, and password a POST sent, or why it won't do. */
async function credentialsFrom(
  c: Context,
): Promise<Credentials | { error: string }> {
  const fields = await fieldsOf(c);
  if (!fields) return { error: "Send a valid JSON body." };
  const { username, password } = fields;
  if (typeof username !== "string" || typeof password !== "string") {
    return { error: "Send a username and a password." };
  }
  return { username: username.trim(), password };
}

/** The guest's name, code and expiry the owner sent, or why they won't do. */
async function newCodeFrom(
  c: Context,
  now: Date,
): Promise<NewCode | { error: string }> {
  const fields = await fieldsOf(c);
  if (!fields) return { error: "Send a valid JSON body." };
  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  if (name.length < 1 || name.length > 80) {
    return { error: "Give the guest a name of 1 to 80 characters." };
  }
  let code: AccessCode | undefined;
  if (fields.code !== undefined && fields.code !== null) {
    code =
      typeof fields.code === "string"
        ? parseAccessCode(fields.code)
        : undefined;
    if (!code) return { error: "Use 3 to 32 letters or digits for the code." };
  }
  let expiresAt: Date | null = null;
  if (fields.expiresAt !== undefined && fields.expiresAt !== null) {
    expiresAt =
      typeof fields.expiresAt === "string" ? new Date(fields.expiresAt) : null;
    if (!expiresAt || !(expiresAt > now)) {
      return { error: "Pick an expiry in the future." };
    }
  }
  return code ? { name, code, expiresAt } : { name, expiresAt };
}

/** Why a new owner's username or password won't do, if it won't. */
function problemWith({ username, password }: Credentials): string | undefined {
  if (username.length < 1 || username.length > 64) {
    return "Pick a username of 1 to 64 characters.";
  }
  if (password.length < 12) {
    return "Pick a password of at least 12 characters.";
  }
  return undefined;
}

/**
 * Who is asking, for rate limiting. Traefik in production and the dev proxy
 * locally each append the address they saw, so only the last entry is
 * something the client can't forge.
 */
function clientOf(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
  // An empty header counts as no header.
  if (forwarded) return forwarded;
  return "unknown";
}

/** Tells a client that has failed too often when it may try again. */
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
}: CoreOptions): Hono {
  const app = new Hono();
  const signingKey: () => Promise<SigningKey> = memoize(() =>
    ensureSigningKey(db),
  );
  const ctx: SessionContext = { db, domain, now, signingKey };
  const loginLimiter = createRateLimiter({
    limit: 5,
    windowMs: 15 * 60 * 1000,
    now,
  });

  const setSessionCookie = (
    c: Context,
    sessionToken: string,
    maxAge = sessionLifetimeSeconds,
  ) => {
    setCookie(c, sessionCookie, sessionToken, {
      httpOnly: true,
      path: "/",
      domain,
      sameSite: "Lax",
      maxAge,
      // Browsers treat *.localhost as a secure context, but WebKit drops
      // Secure cookies over plain http, so local domains go without.
      secure: !isLocal(domain),
    });
  };
  const trustedHosts = new Set(trustedApps.map((slug) => `${slug}.${domain}`));

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
    } catch {
      return c.json({ status: "unavailable" }, 503);
    }
    return c.json({ status: "ok" });
  });

  app.get("/.well-known/jwks.json", async (c) => {
    const { kid, publicJwk } = await signingKey();
    return c.json({ keys: [{ ...publicJwk, kid, alg: "EdDSA", use: "sig" }] });
  });

  app.get("/session", async (c) => {
    const { answer, freshSessionToken } = await readSession(
      ctx,
      getCookie(c, sessionCookie),
    );
    if (freshSessionToken) setSessionCookie(c, freshSessionToken);
    return c.json<SessionAnswer>(answer);
  });

  // An app's guard sends an expired token here, and it comes straight back
  // to `next` with a fresh cookie, or none if its session ended. The app's
  // guard then decides whether to send the browser to log in. The token is
  // reissued even if core thinks it live, since the app's clock may run
  // ahead of core's, and a bounce without a new token would loop.
  app.get("/refresh", async (c) => {
    const next = appUrl(c.req.query("next"), domain);
    if (!next) {
      return c.json(
        { error: "Send next, a URL on one of this install's apps." },
        400,
      );
    }
    const sessionToken = getCookie(c, sessionCookie);
    const { answer, freshSessionToken } = await readSession(ctx, sessionToken, {
      renew: true,
    });
    if (freshSessionToken) setSessionCookie(c, freshSessionToken);
    else if (sessionToken && answer.state !== "signed-in") {
      setSessionCookie(c, "", 0);
    }
    c.header("Cache-Control", "no-store");
    return c.redirect(next, 302);
  });

  app.post("/setup", async (c) => {
    const credentials = await credentialsFrom(c);
    if ("error" in credentials) return c.json(credentials, 400);
    const problem = problemWith(credentials);
    if (problem) return c.json({ error: problem }, 400);

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
    const credentials = await credentialsFrom(c);
    if ("error" in credentials) return c.json(credentials, 400);

    const client = clientOf(c);
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
      return c.json({ error: "That code doesn't work." }, 401);
    }
    setSessionCookie(c, result.sessionToken);
    return c.json<SessionAnswer>({ state: "signed-in", viewer: result.viewer });
  });

  // The hub sends no body here, so none is read.
  app.post("/logout", async (c) => {
    await signOut(ctx, getCookie(c, sessionCookie));
    setSessionCookie(c, "", 0);
    return c.body(null, 204);
  });

  // Admin manages codes over CORS with the owner's cookie. Anyone else is
  // told there is nothing here.
  const ownerOnly: MiddlewareHandler = async (c, next) => {
    const { answer, freshSessionToken } = await readSession(
      ctx,
      getCookie(c, sessionCookie),
    );
    if (answer.state !== "signed-in" || answer.viewer.kind !== "owner") {
      return c.json({ error: "Not found" }, 404);
    }
    if (freshSessionToken) setSessionCookie(c, freshSessionToken);
    await next();
  };
  app.use("/codes", ownerOnly);
  app.use("/codes/*", ownerOnly);

  app.get("/codes", async (c) =>
    c.json({ codes: await listCodes(db, now(), domain) }),
  );

  app.post("/codes", async (c) => {
    const at = now();
    const request = await newCodeFrom(c, at);
    if ("error" in request) return c.json(request, 400);
    const mint = await mintCode(db, request, at, domain);
    if (mint.outcome === "taken") {
      return c.json({ error: "That code is taken." }, 409);
    }
    return c.json(mint.code, 201);
  });

  app.post("/codes/:id/revoke", async (c) => {
    if (!(await revokeCode(db, c.req.param("id"), now()))) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.body(null, 204);
  });
  return app;
}
