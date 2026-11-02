import { SignJWT } from "jose";
import {
  sessionTokenLifetimeSeconds,
  type SessionTokenClaims,
} from "@robkit/session";
import type { SigningKey } from "./signing-key.ts";

export function mintSessionToken(
  key: SigningKey,
  claims: SessionTokenClaims,
  now: Date,
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const { kind, id, sessionId } = claims;
  const roles = claims.kind === "guest" ? { roles: claims.roles } : {};
  return new SignJWT({ sid: sessionId, kind, ...roles })
    .setProtectedHeader({ alg: "EdDSA", kid: key.kid })
    .setSubject(id)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + sessionTokenLifetimeSeconds)
    .sign(key.privateKey);
}
