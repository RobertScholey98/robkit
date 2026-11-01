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

/** Whose session a token is for, and which session. */
export interface SessionTokenClaims {
  kind: "owner";
  id: string;
  sessionId: string;
}

/** A session token's claims, once its signature checks out. */
export interface ReadSessionToken extends SessionTokenClaims {
  /** The token's lifetime has passed; its session may still be live. */
  expired: boolean;
}

/** Core's public key, or a key set that finds it by the token's `kid`. */
export type VerifyKey = CryptoKey | JWTVerifyGetKey;

/** jose's codes for a token that is bad, as opposed to keys that can't load. */
const badToken = new Set([
  "ERR_JWS_INVALID",
  "ERR_JWT_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWKS_NO_MATCHING_KEY",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JOSE_NOT_SUPPORTED",
]);

function claimsIn(payload: JWTPayload): SessionTokenClaims | undefined {
  const { sub, sid, kind } = payload;
  return typeof sub === "string" && typeof sid === "string" && kind === "owner"
    ? { kind, id: sub, sessionId: sid }
    : undefined;
}

/**
 * Checks a session token's signature and reads its claims, even once it has
 * expired: core holds the session itself, so it can renew an expired token.
 * A bad token reads as undefined. Failing to load the keys throws, so a
 * caller can tell "not signed in" from "can't check".
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
    if (error instanceof errors.JOSEError && badToken.has(error.code)) {
      return undefined;
    }
    // jose checks the signature before the expiry, so an expired token's
    // payload is still one core signed.
    if (!(error instanceof errors.JWTExpired)) throw error;
    const claims = claimsIn(error.payload);
    return claims && { ...claims, expired: true };
  }
}
