import { and, eq, gt, isNull } from "drizzle-orm";
import type {
  CodeId,
  RoleId,
  SessionState,
  SignedInViewer,
} from "@robkit/guard";
import {
  readSessionToken,
  type ReadSessionToken,
  type SessionTokenClaims,
} from "@robkit/session";
import { standingOf, type AccessCode } from "./access-codes.ts";
import type { Database } from "./database.ts";
import { dummyPasswordHash, verifyPassword } from "./password.ts";
import { accessCodes, owner, sessions } from "./schema.ts";
import { mintSessionToken } from "./mint-token.ts";
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

export interface OwnerProfile {
  kind: "owner";
  id: string;
  username: string;
}

/** A guest, by their access code's id, and the name the owner gave them. */
export interface GuestProfile {
  kind: "guest";
  id: CodeId;
  name: string;
}

export type Profile = OwnerProfile | GuestProfile;

/** Who is asking, as `GET /session` answers it. */
export type SessionAnswer =
  | { state: "unclaimed" }
  | { state: "signed-out" }
  | { state: "signed-in"; viewer: Profile };

export interface SignedIn {
  viewer: Profile;
  sessionToken: string;
}

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

/** Who holds a session: their profile, and a guest's roles, by id. */
interface Holder {
  profile: Profile;
  roles: RoleId[];
}

function guardViewerOf({ profile, roles }: Holder): SignedInViewer {
  return profile.kind === "owner"
    ? { kind: profile.kind, id: profile.id }
    : { kind: profile.kind, id: profile.id, roles };
}

function sameRoles(a: readonly RoleId[], b: readonly RoleId[]): boolean {
  return a.length === b.length && a.every((role, i) => role === b[i]);
}

function claimsFor(
  { profile, roles }: Holder,
  sessionId: string,
): SessionTokenClaims {
  return profile.kind === "owner"
    ? { kind: profile.kind, id: profile.id, sessionId }
    : { kind: profile.kind, id: profile.id, sessionId, roles };
}

/** Starts a session for its holder, in the caller's transaction. */
export async function startSession(
  ctx: SessionContext,
  tx: Transaction,
  holder: Holder,
): Promise<SignedIn> {
  const { profile } = holder;
  const now = ctx.now();
  const [session] = await tx
    .insert(sessions)
    .values({
      ...(profile.kind === "owner"
        ? { ownerId: profile.id }
        : { codeId: profile.id }),
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetimeSeconds * 1000),
    })
    .returning({ id: sessions.id });
  if (!session) throw new Error("Core couldn't store the session.");
  return {
    viewer: profile,
    sessionToken: await mintSessionToken(
      await ctx.signingKey(),
      claimsFor(holder, session.id),
      now,
    ),
  };
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
        profile: { kind: "owner", id: found.id, username: found.username },
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
        profile: { kind: "guest", id: found.id, name: found.name },
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
          profile: {
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
        profile: { kind: "guest", id: found.code.id, name: found.code.name },
        roles: await rolesOf(ctx.db, found.code),
      };
    }
  }
}

/**
 * The claims of the first of `sessionTokens` that is core's own token, if
 * any. An app's token, or one an older robkit set on the parent domain,
 * doesn't count.
 */
async function coreClaimsIn(
  ctx: SessionContext,
  sessionTokens: readonly string[],
  now: Date,
): Promise<ReadSessionToken | undefined> {
  const { publicKey } = await ctx.signingKey();
  for (const sessionToken of sessionTokens) {
    const claims = await readSessionToken(publicKey, sessionToken, now);
    if (claims) return claims;
  }
  return undefined;
}

/**
 * Answers who holds the session of the first of `sessionTokens` that is
 * core's own. Its signature must be core's, but its session row decides: a
 * revoked or expired session signs the holder out, and a live session
 * renews an expired token, or a guest's token whose roles have changed.
 * With `renew`, a live session renews any token.
 */
export async function readSession(
  ctx: SessionContext,
  sessionTokens: readonly string[],
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
  const now = ctx.now();
  const claims = await coreClaimsIn(ctx, sessionTokens, now);
  if (!claims) return signedOut;
  const holder = await holderOf(ctx, claims, found, now);
  if (!holder) return signedOut;

  const answer: SessionAnswer = { state: "signed-in", viewer: holder.profile };
  const forGuard: SessionState = {
    state: "signed-in",
    viewer: guardViewerOf(holder),
  };
  // A guest whose roles changed gets a token with the new ones at once, so
  // the apps they open agree with the launcher core lists for them.
  const rolesChanged =
    claims.kind === "guest" && !sameRoles(claims.roles, holder.roles);
  if (!claims.expired && !renew && !rolesChanged) {
    return { answer, forGuard };
  }
  return {
    answer,
    forGuard,
    freshSessionToken: await mintSessionToken(
      await ctx.signingKey(),
      claimsFor(holder, claims.sessionId),
      now,
    ),
  };
}

/** Revokes the session of the first of `sessionTokens` that is core's own. */
export async function signOut(
  ctx: SessionContext,
  sessionTokens: readonly string[],
): Promise<void> {
  const now = ctx.now();
  const claims = await coreClaimsIn(ctx, sessionTokens, now);
  if (!claims) return;
  await ctx.db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, claims.sessionId), isNull(sessions.revokedAt)));
}
