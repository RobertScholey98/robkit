import {
  errors,
  jwtVerify,
  type CryptoKey,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

/** The cookie that carries the session token on every subdomain. */
export const sessionCookie = "robkit_session";

/** A session token lives 15 minutes; core reissues it while the session lives. */
export const sessionTokenLifetimeSeconds = 15 * 60;

export interface SessionTokenClaims {
  ownerId: string;
  sessionId: string;
}

/** A session token's claims, once its signature checks out. */
export interface ReadSessionToken extends SessionTokenClaims {
  /** The token's lifetime has passed; its session may still be live. */
  expired: boolean;
}

/** Core's public key, or a key set that finds it by the token's `kid`. */
export type VerifyKey = CryptoKey | JWTVerifyGetKey;

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
  key: VerifyKey,
  token: string,
  now: Date,
): Promise<ReadSessionToken | undefined> {
  const options = { algorithms: ["EdDSA"], currentDate: now };
  try {
    const { payload } =
      typeof key === "function"
        ? await jwtVerify(token, key, options)
        : await jwtVerify(token, key, options);
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
