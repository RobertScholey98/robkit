import { and, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "./database.ts";
import { dummyPasswordHash, hashPassword, verifyPassword } from "./password.ts";
import { owner, sessions } from "./schema.ts";
import { readSessionToken } from "@robkit/session";
import { mintSessionToken } from "./session-token.ts";
import type { SigningKey } from "./signing-key.ts";

/** A session lasts 30 days from sign-in. */
export const sessionLifetimeSeconds = 30 * 24 * 60 * 60;

/** What core needs to start and read sessions. */
export interface SessionContext {
  db: Database;
  now: () => Date;
  signingKey: () => Promise<SigningKey>;
}

export interface OwnerViewer {
  kind: "owner";
  id: string;
  username: string;
}

/** Who is asking, as `GET /session` answers it. */
export type SessionAnswer =
  | { state: "unclaimed" }
  | { state: "signed-out" }
  | { state: "signed-in"; viewer: OwnerViewer };

export interface SignedIn {
  viewer: OwnerViewer;
  sessionToken: string;
}

export type Claim = ({ outcome: "claimed" } & SignedIn) | { outcome: "taken" };

export type SignIn =
  | ({ outcome: "signed-in" } & SignedIn)
  | { outcome: "wrong" }
  | { outcome: "unclaimed" };

export interface SessionRead {
  answer: SessionAnswer;
  /** A new session token for the cookie, when the old one had expired. */
  freshSessionToken?: string;
}

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function startSession(
  ctx: SessionContext,
  tx: Transaction,
  { id, username }: { id: string; username: string },
): Promise<SignedIn> {
  const now = ctx.now();
  const [session] = await tx
    .insert(sessions)
    .values({
      ownerId: id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeSeconds * 1000),
    })
    .returning({ id: sessions.id });
  if (!session) throw new Error("Core couldn't store the session.");
  return {
    viewer: { kind: "owner", id, username },
    sessionToken: await mintSessionToken(
      await ctx.signingKey(),
      { kind: "owner", id, sessionId: session.id },
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
      return { outcome: "claimed", ...(await startSession(ctx, tx, created)) };
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
    ...(await ctx.db.transaction((tx) => startSession(ctx, tx, found))),
  };
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
  const signedOut: SessionRead = { answer: { state: "signed-out" } };
  const [found] = await ctx.db.select().from(owner);
  if (!found) return { answer: { state: "unclaimed" } };
  if (!sessionToken) return signedOut;

  const now = ctx.now();
  const key = await ctx.signingKey();
  const claims = await readSessionToken(key.publicKey, sessionToken, now);
  if (claims?.kind !== "owner" || claims.id !== found.id) return signedOut;
  const [live] = await ctx.db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.id, claims.sessionId),
        eq(sessions.ownerId, found.id),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now),
      ),
    );
  if (!live) return signedOut;

  const answer: SessionAnswer = {
    state: "signed-in",
    viewer: { kind: "owner", id: found.id, username: found.username },
  };
  if (!claims.expired && !renew) return { answer };
  return {
    answer,
    freshSessionToken: await mintSessionToken(key, claims, now),
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
