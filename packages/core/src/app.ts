import { sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import type { Database } from "./database.ts";
import {
  claimInstall,
  sessionLifetimeSeconds,
  type SessionAnswer,
  type SessionContext,
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

const sessionCookie = "robkit_session";

/**
 * Browsers treat `*.localhost` as a secure context, but WebKit drops Secure
 * cookies over plain http, so local domains go without.
 */
function isLocal(domain: string): boolean {
  return domain === "localhost" || domain.endsWith(".localhost");
}

function isJson(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
}

interface Credentials {
  username: string;
  password: string;
}

/** The username, trimmed, and password a POST sent, or why it won't do. */
async function credentialsFrom(
  c: Context,
): Promise<Credentials | { error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { error: "Send a valid JSON body." };
  }
  const { username, password } =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  if (typeof username !== "string" || typeof password !== "string") {
    return { error: "Send a username and a password." };
  }
  return { username: username.trim(), password };
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
  const ctx: SessionContext = { db, now, signingKey };

  const setSessionCookie = (c: Context, sessionToken: string) => {
    setCookie(c, sessionCookie, sessionToken, {
      httpOnly: true,
      path: "/",
      domain,
      sameSite: "Lax",
      maxAge: sessionLifetimeSeconds,
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

  return app;
}
