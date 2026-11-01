import { errors, jwtVerify, SignJWT, type JWTPayload } from "jose";
import type { SigningKey } from "./signing-key.ts";

/** A session token lives 15 minutes; core reissues it while the session lives. */
export const sessionTokenLifetimeSeconds = 15 * 60;

export interface SessionTokenClaims {
  ownerId: string;
  sessionId: string;
}

/** Signs a session token for the owner's session, valid from `now`. */
export function mintSessionToken(
  key: SigningKey,
  { ownerId, sessionId }: SessionTokenClaims,
  now: Date,
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sid: sessionId, kind: "owner" })
    .setProtectedHeader({ alg: "EdDSA", kid: key.kid })
    .setSubject(ownerId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + sessionTokenLifetimeSeconds)
    .sign(key.privateKey);
}

/** A session token's claims, once its signature checks out. */
export interface ReadSessionToken extends SessionTokenClaims {
  /** The token's lifetime has passed; its session may still be live. */
  expired: boolean;
}

function claimsIn(payload: JWTPayload): SessionTokenClaims | undefined {
  const { sub, sid, kind } = payload;
  return typeof sub === "string" && typeof sid === "string" && kind === "owner"
    ? { ownerId: sub, sessionId: sid }
    : undefined;
}

/**
 * Checks a session token's signature and reads its claims, even once it has
 * expired: core holds the session itself, so it can renew an expired token.
 */
export async function readSessionToken(
  key: SigningKey,
  token: string,
  now: Date,
): Promise<ReadSessionToken | undefined> {
  try {
    const { payload } = await jwtVerify(token, key.publicKey, {
      algorithms: ["EdDSA"],
      currentDate: now,
    });
    const claims = claimsIn(payload);
    return claims && { ...claims, expired: false };
  } catch (error) {
    // jose checks the signature before the expiry, so an expired token's
    // payload is still one core signed.
    if (!(error instanceof errors.JWTExpired)) return undefined;
    const claims = claimsIn(error.payload);
    return claims && { ...claims, expired: true };
  }
}
