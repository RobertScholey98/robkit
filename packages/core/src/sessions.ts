import { and, eq, gt, isNull } from "drizzle-orm";
import type { SessionState, SignedInViewer } from "@robkit/guard";
import { readSessionToken, type SessionTokenClaims } from "@robkit/session";
import { standingOf, type AccessCode } from "./access-codes.ts";
import type { Database } from "./database.ts";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password.ts";
import { accessCodes, owner, sessions } from "./schema.ts";
import { mintSessionToken } from "./session-token.ts";
import { rolesOf } from "./roles.ts";
import type { SigningKey } from "./signing-key.ts";

/** A session lasts 30 days from sign-in. */
export const sessionLifetimeSeconds = 30 * 24 * 60 * 60;

/** What core needs to start and read sessions. */
export interface SessionContext {
  db: Database;
  /** The install's domain, which decides whether the test code works. */
  domain: string;
  now: () => Date;
  signingKey: () => Promise<SigningKey>;
}

export interface OwnerViewer {
  kind: "owner";
  id: string;
  username: string;
}

/** A guest, by their access code's id, and the name the owner gave them. */
export interface GuestViewer {
  kind: "guest";
  id: string;
  name: string;
}

export type Viewer = OwnerViewer | GuestViewer;

/** Who is asking, as `GET /session` answers it. */
export type SessionAnswer =
  | { state: "unclaimed" }
  | { state: "signed-out" }
  | { state: "signed-in"; viewer: Viewer };

export interface SignedIn {
  viewer: Viewer;
  sessionToken: string;
}

export type Claim = ({ outcome: "claimed" } & SignedIn) | { outcome: "taken" };

export type SignIn =
  | ({ outcome: "signed-in" } & SignedIn)
  | { outcome: "wrong" }
  | { outcome: "unclaimed" };

export interface SessionRead {
  answer: SessionAnswer;
  /** The same session as an app's guard sees it, roles included. */
  forGuard: SessionState;
  /** A new session token for the cookie, when the old one had expired. */
  freshSessionToken?: string;
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Who holds a session: the viewer, and a guest's roles, by id. */
interface Holder {
  viewer: Viewer;
  roles: string[];
}

function guardViewerOf({ viewer, roles }: Holder): SignedInViewer {
  return viewer.kind === "owner"
    ? { kind: viewer.kind, id: viewer.id }
    : { kind: viewer.kind, id: viewer.id, roles };
}

function claimsFor(
  { viewer, roles }: Holder,
  sessionId: string,
): SessionTokenClaims {
  return viewer.kind === "owner"
    ? { kind: viewer.kind, id: viewer.id, sessionId }
    : { kind: viewer.kind, id: viewer.id, sessionId, roles };
}

async function startSession(
  ctx: SessionContext,
  tx: Transaction,
  holder: Holder,
): Promise<SignedIn> {
  const { viewer } = holder;
  const now = ctx.now();
  const [session] = await tx
    .insert(sessions)
    .values({
      ...(viewer.kind === "owner"
        ? { ownerId: viewer.id }
        : { codeId: viewer.id }),
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeSeconds * 1000),
    })
    .returning({ id: sessions.id });
  if (!session) throw new Error("Core couldn't store the session.");
  return {
    viewer,
    sessionToken: await mintSessionToken(
      await ctx.signingKey(),
      claimsFor(holder, session.id),
      now,
    ),
  };
}

function isUniqueViolation(error: unknown): boolean {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ("code" in e && e.code === "23505") return true;
  }
  return false;
}

/**
 * Makes the first caller the install's owner and signs them in. The database
 * holds at most one owner, so of two racing claims one is `taken`.
 */
export async function claimInstall(
  ctx: SessionContext,
  username: string,
  password: string,
): Promise<Claim> {
  if ((await ctx.db.select({ id: owner.id }).from(owner)).length > 0) {
    return { outcome: "taken" };
  }
  const passwordHash = await hashPassword(password);
  try {
    return await ctx.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(owner)
        .values({ username, passwordHash, createdAt: ctx.now() })
        .returning({ id: owner.id, username: owner.username });
      if (!created) throw new Error("Core couldn't store the owner.");
      return {
        outcome: "claimed",
        ...(await startSession(ctx, tx, {
          viewer: { kind: "owner", ...created },
          roles: [],
        })),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "taken" };
    throw error;
  }
}

/** Signs the owner in if the username and password are theirs. */
export async function signIn(
  ctx: SessionContext,
  username: string,
  password: string,
): Promise<SignIn> {
  const [found] = await ctx.db.select().from(owner);
  if (!found) return { outcome: "unclaimed" };
  // An unknown username still costs one scrypt, so timing can't tell it apart.
  const isOwner = found.username === username;
  const matches = await verifyPassword(
    password,
    isOwner ? found.passwordHash : dummyPasswordHash,
  );
  if (!isOwner || !matches) return { outcome: "wrong" };
  return {
    outcome: "signed-in",
    ...(await ctx.db.transaction((tx) =>
      startSession(ctx, tx, {
        viewer: { kind: "owner", id: found.id, username: found.username },
        roles: [],
      }),
    )),
  };
}

export type CodeSignIn =
  | ({ outcome: "signed-in" } & SignedIn)
  | { outcome: "refused" }
  | { outcome: "unclaimed" };

export async function signInWithCode(
  ctx: SessionContext,
  code: AccessCode,
): Promise<CodeSignIn> {
  if ((await ctx.db.select({ id: owner.id }).from(owner)).length === 0) {
    return { outcome: "unclaimed" };
  }
  const [found] = await ctx.db
    .select()
    .from(accessCodes)
    .where(eq(accessCodes.code, code));
  if (!found || standingOf(found, ctx.now(), ctx.domain) !== "live") {
    return { outcome: "refused" };
  }
  return {
    outcome: "signed-in",
    ...(await ctx.db.transaction(async (tx) =>
      startSession(ctx, tx, {
        viewer: { kind: "guest", id: found.id, name: found.name },
        roles: await rolesOf(tx, found),
      }),
    )),
  };
}

/**
 * Who holds the live session the claims name, if anyone, with their roles
 * as they are now. A guest's session also needs their code to still work.
 */
async function holderOf(
  ctx: SessionContext,
  claims: SessionTokenClaims,
  theOwner: { id: string; username: string },
  now: Date,
): Promise<Holder | undefined> {
  const live = and(
    eq(sessions.id, claims.sessionId),
    isNull(sessions.revokedAt),
    gt(sessions.expiresAt, now),
  );
  switch (claims.kind) {
    case "owner": {
      if (claims.id !== theOwner.id) return undefined;
      const [session] = await ctx.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(live, eq(sessions.ownerId, theOwner.id)));
      return (
        session && {
          viewer: {
            kind: "owner",
            id: theOwner.id,
            username: theOwner.username,
          },
          roles: [],
        }
      );
    }
    case "guest": {
      const [found] = await ctx.db
        .select({ code: accessCodes })
        .from(sessions)
        .innerJoin(accessCodes, eq(sessions.codeId, accessCodes.id))
        .where(and(live, eq(sessions.codeId, claims.id)));
      if (!found || standingOf(found.code, now, ctx.domain) !== "live") {
        return undefined;
      }
      return {
        viewer: { kind: "guest", id: found.code.id, name: found.code.name },
        roles: await rolesOf(ctx.db, found.code),
      };
    }
  }
}

/**
 * Answers who the session token's holder is. The token's signature must be
 * core's, but its session row decides: a revoked or expired session signs the
 * holder out, and a live session renews an expired token. With `renew`, a
 * live session renews any token, expired or not.
 */
export async function readSession(
  ctx: SessionContext,
  sessionToken: string | undefined,
  { renew = false }: { renew?: boolean } = {},
): Promise<SessionRead> {
  const signedOut: SessionRead = {
    answer: { state: "signed-out" },
    forGuard: { state: "signed-out" },
  };
  const [found] = await ctx.db.select().from(owner);
  if (!found) {
    return {
      answer: { state: "unclaimed" },
      forGuard: { state: "signed-out" },
    };
  }
  if (!sessionToken) return signedOut;

  const now = ctx.now();
  const key = await ctx.signingKey();
  const claims = await readSessionToken(key.publicKey, sessionToken, now);
  if (!claims) return signedOut;
  const holder = await holderOf(ctx, claims, found, now);
  if (!holder) return signedOut;

  const answer: SessionAnswer = { state: "signed-in", viewer: holder.viewer };
  const forGuard: SessionState = {
    state: "signed-in",
    viewer: guardViewerOf(holder),
  };
  if (!claims.expired && !renew) return { answer, forGuard };
  return {
    answer,
    forGuard,
    freshSessionToken: await mintSessionToken(
      key,
      claimsFor(holder, claims.sessionId),
      now,
    ),
  };
}

/** Revokes the session the token belongs to, if it is core's and still live. */
export async function signOut(
  ctx: SessionContext,
  sessionToken: string | undefined,
): Promise<void> {
  if (!sessionToken) return;
  const now = ctx.now();
  const claims = await readSessionToken(
    (await ctx.signingKey()).publicKey,
    sessionToken,
    now,
  );
  if (!claims) return;
  await ctx.db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, claims.sessionId), isNull(sessions.revokedAt)));
}
