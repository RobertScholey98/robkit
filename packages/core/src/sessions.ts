import type { Database } from "./database.ts";
import { hashPassword } from "./password.ts";
import { owner, sessions } from "./schema.ts";
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
      { ownerId: id, sessionId: session.id },
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
