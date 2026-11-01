import { SignJWT } from "jose";
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
