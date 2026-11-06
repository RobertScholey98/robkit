import { isProblem, type InputProblem } from "@robkit/session/input";
import { hashPassword } from "./password.ts";
import { owner } from "./schema.ts";
import {
  startSession,
  type SessionContext,
  type SignedIn,
} from "./session-store.ts";

/** The username, trimmed, and password someone sent to sign in as the owner. */
export interface Credentials {
  username: string;
  password: string;
}

/** The username and password a request sent, or why they won't do. */
export function readCredentials(
  fields: Record<string, unknown>,
): Credentials | InputProblem {
  const { username, password } = fields;
  if (typeof username !== "string" || typeof password !== "string") {
    return { error: "Send a username and a password." };
  }
  return { username: username.trim(), password };
}

/** The new owner's username and password, or why they won't do. */
export function readNewOwner(
  fields: Record<string, unknown>,
): Credentials | InputProblem {
  const credentials = readCredentials(fields);
  if (isProblem(credentials)) return credentials;
  const { username, password } = credentials;
  if (username.length < 1 || username.length > 64) {
    return { error: "Pick a username of 1 to 64 characters." };
  }
  if (password.length < 12) {
    return { error: "Pick a password of at least 12 characters." };
  }
  return credentials;
}

export type Claim = ({ outcome: "claimed" } & SignedIn) | { outcome: "taken" };

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
          profile: { kind: "owner", ...created },
          roles: [],
        })),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "taken" };
    throw error;
  }
}
