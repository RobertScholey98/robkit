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

/**
 * Who a token is for. A guest's id is their access code's id, never the
 * code itself, since apps see it. A guest's token carries their code's
 * roles, by id, as they were when core issued it.
 */
export type ViewerClaims =
  | { kind: "owner"; id: string }
  | { kind: "guest"; id: string; roles: string[] };

/** Whose session a token is for, and which session. */
export type SessionTokenClaims = ViewerClaims & { sessionId: string };

/** A session token's claims, once its signature checks out. */
export type ReadSessionToken = SessionTokenClaims & {
  /** The token's lifetime has passed; its session may still be live. */
  expired: boolean;
};

/** An app token's claims, once its signature and audience check out. */
export type ReadAppToken = ViewerClaims & {
  /** The token's lifetime has passed; core may still hold the session. */
  expired: boolean;
};

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

function isRoleList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((role) => typeof role === "string")
  );
}

function viewerIn(payload: JWTPayload): ViewerClaims | undefined {
  const { sub, kind, roles } = payload;
  if (typeof sub !== "string") return undefined;
  if (kind === "owner") return { kind, id: sub };
  if (kind === "guest" && isRoleList(roles)) return { kind, id: sub, roles };
  return undefined;
}

function claimsIn(payload: JWTPayload): SessionTokenClaims | undefined {
  const viewer = viewerIn(payload);
  const { sid } = payload;
  return viewer && typeof sid === "string"
    ? { ...viewer, sessionId: sid }
    : undefined;
}

/**
 * A token's payload once its signature checks out, even once it has
 * expired. A bad token reads as undefined. Failing to load the keys throws,
 * so a caller can tell "not signed in" from "can't check".
 */
async function verified(
  key: VerifyKey,
  token: string,
  now: Date,
): Promise<{ payload: JWTPayload; expired: boolean } | undefined> {
  const options = { algorithms: ["EdDSA"], currentDate: now };
  try {
    const { payload } =
      typeof key === "function"
        ? await jwtVerify(token, key, options)
        : await jwtVerify(token, key, options);
    return { payload, expired: false };
  } catch (error) {
    if (error instanceof errors.JOSEError && badToken.has(error.code)) {
      return undefined;
    }
    // jose checks the signature before the expiry, so an expired token's
    // payload is still one core signed.
    if (!(error instanceof errors.JWTExpired)) throw error;
    return { payload: error.payload, expired: true };
  }
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
  const read = await verified(key, token, now);
  const claims = read && claimsIn(read.payload);
  return claims && { ...claims, expired: read.expired };
}

/**
 * Checks an app token's signature and that its audience is `app`, and reads
 * who it is for, even once it has expired. A token for any other audience,
 * core's included, reads as undefined, as a bad one does. Failing to load
 * the keys throws.
 */
export async function readAppToken(
  key: VerifyKey,
  token: string,
  now: Date,
  app: string,
): Promise<ReadAppToken | undefined> {
  const read = await verified(key, token, now);
  if (read?.payload.aud !== app) return undefined;
  const viewer = viewerIn(read.payload);
  return viewer && { ...viewer, expired: read.expired };
}

/**
 * Every session cookie's value a request's `Cookie` header carries, in the
 * order it sends them. A browser can hold more than one: a host-only cookie,
 * and one an older robkit set on the parent domain.
 */
export function sessionTokensIn(
  cookieHeader: string | null | undefined,
): string[] {
  const tokens: string[] = [];
  for (const pair of cookieHeader?.split(";") ?? []) {
    const [name, ...value] = pair.split("=");
    if (name?.trim() === sessionCookie) tokens.push(value.join("=").trim());
  }
  return tokens;
}
