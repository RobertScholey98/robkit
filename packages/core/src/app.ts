import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { reportToConsole, type Report } from "@robkit/input/report";
import type { CoreOrigin } from "@robkit/input";
import { coreInstall } from "@robkit/input/addresses";
import { isRedirect, securityHeaders, withHeaders } from "@robkit/session";
import type { TrustedProxy } from "./client.ts";
import type { Database } from "./database.ts";
import type { RouteContext } from "./routes/context.ts";
import { appRoutes } from "./routes/apps.ts";
import { accessCodeRoutes } from "./routes/access-codes.ts";
import { roleRoutes } from "./routes/roles.ts";
import { sessionRoutes } from "./routes/session.ts";
import { defaultSignInLimits, type SignInLimits } from "./sign-in-limits.ts";
import { statusRoutes } from "./routes/status.ts";
import { ensureSigningKey, type SigningKey } from "./signing-key.ts";
import { createPasswordChecker } from "./password.ts";

export interface CoreOptions {
  db: Database;
  /**
   * Core's public origin, as `readCoreUrl` read it, such as
   * `http://core.robkit.localhost:3000` in development. Every other address
   * of the install comes from it.
   */
  origin: CoreOrigin;
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
  /**
   * Any sign-in limits to set in place of their defaults. It is there for
   * tests and tuning; an install leaves it out.
   */
  signInLimits?: Partial<SignInLimits>;
}

function isJson(contentType: string | undefined): boolean {
  const mediaType = contentType?.split(";")[0]?.trim().toLowerCase();
  return mediaType === "application/json";
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

/**
 * Core's HTTP app: CORS and the rules every POST meets, then each module of
 * routes, with one handler for what a route didn't expect.
 */
export function createApp({
  db,
  origin,
  now = () => new Date(),
  trustedProxy,
  logError = reportToConsole,
  signInLimits,
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

  // No page of core's may be framed, and a browser reads each as the type
  // it says. A redirect renders nothing, so it gets no framing header: an
  // app that lets a framer in renews its token through /refresh inside the
  // frame. Registered before cors(), so a preflight's answer gets them.
  app.use(async (c, next) => {
    await next();
    const framers = isRedirect(c.res.status) ? undefined : "none";
    c.res = withHeaders(c.res, securityHeaders(origin, framers));
  });

  const install = coreInstall(origin);
  // The hub and admin call core from the browser with the session cookie.
  // A browser's Origin header is serialized as URL.origin is, so each must
  // match one exactly: protocol, host and port.
  const trustedOrigins = new Set([
    install.origin("hub"),
    install.origin("admin"),
  ]);
  app.use(
    cors({
      origin: (origin) => (trustedOrigins.has(origin) ? origin : null),
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

  const signingKey: () => Promise<SigningKey> = memoize(() =>
    ensureSigningKey(db),
  );
  const limits = { ...defaultSignInLimits, ...signInLimits };
  const context: RouteContext = {
    db,
    install,
    now,
    signingKey,
    passwords: createPasswordChecker({
      atOnce: limits.passwordChecksAtOnce,
      waiting: limits.passwordChecksWaiting,
      onFull: () => {
        logError(
          `Password checks: ${String(limits.passwordChecksAtOnce)} running and ${String(limits.passwordChecksWaiting)} waiting, the most core allows. Core answers more 429 until one finishes.`,
        );
      },
    }),
    trustedProxy,
    logError,
    signInLimits: limits,
  };
  app.route("/", statusRoutes(context));
  app.route("/", sessionRoutes(context));
  app.route("/", accessCodeRoutes(context));
  app.route("/", appRoutes(context));
  app.route("/", roleRoutes(context));
  return app;
}
