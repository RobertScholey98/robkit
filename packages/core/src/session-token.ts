import { SignJWT } from "jose";
import type { SignedInViewer } from "@robkit/guard";
import {
  coreAudience,
  sessionTokenLifetimeSeconds,
  type SessionTokenClaims,
} from "@robkit/session";
import type { Slug } from "@robkit/session/addresses";
import type { SigningKey } from "./signing-key.ts";

function mint(
  key: SigningKey,
  claims: Record<string, unknown>,
  subject: string,
  audience: string,
  now: Date,
): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: key.kid })
    .setSubject(subject)
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + sessionTokenLifetimeSeconds)
    .sign(key.privateKey);
}

/** Core's own token for its cookie, naming the session it belongs to. */
export function mintSessionToken(
  key: SigningKey,
  claims: SessionTokenClaims,
  now: Date,
): Promise<string> {
  const { kind, id, sessionId } = claims;
  const roles = claims.kind === "guest" ? { roles: claims.roles } : {};
  return mint(key, { sid: sessionId, kind, ...roles }, id, coreAudience, now);
}

/**
 * A token for one app, `slug`, naming who the viewer is and nothing else:
 * no session id, so nothing the app holds names a session core would renew.
 */
export function mintAppToken(
  key: SigningKey,
  viewer: SignedInViewer,
  slug: Slug,
  now: Date,
): Promise<string> {
  const roles = viewer.kind === "guest" ? { roles: viewer.roles } : {};
  return mint(key, { kind: viewer.kind, ...roles }, viewer.id, slug, now);
}
