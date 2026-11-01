import { SignJWT } from "jose";
import {
  sessionTokenLifetimeSeconds,
  type SessionTokenClaims,
} from "@robkit/session";
import type { SigningKey } from "./signing-key.ts";

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
