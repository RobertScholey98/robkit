import type { ConformanceCase } from "@robkit/guard/conformance";
import { sessionCookie, sessionTokenLifetimeSeconds } from "@robkit/session";
import { generateKeyPair, SignJWT, type CryptoKey } from "jose";

/** The owner, as the tokens below name them. */
export const owner = { kind: "owner", id: "owner-1" } as const;

/** Whose session a token is for. */
export type Holder =
  typeof owner | { kind: "guest"; id: string; roles: readonly string[] };

/** A guest holding `roles`, by id. */
export const guest = (roles: readonly string[] = []): Holder => ({
  kind: "guest",
  id: "code-1",
  roles,
});

/** A key pair standing in for core's signing key, for adapters' tests. */
export interface SigningKey {
  /** Hand this to the adapter as core's key. */
  publicKey: CryptoKey;
  /** A session token shaped like core's, issued `ageSeconds` ago. */
  token(ageSeconds?: number, holder?: Holder): Promise<string>;
  /** The cookie header a conformance case's visitor sends, if any. */
  cookieFor(asking: ConformanceCase): Promise<{ cookie?: string }>;
}

/** Long enough ago that a token has expired. */
const expiredAgeSeconds = sessionTokenLifetimeSeconds + 5 * 60;

export async function signingKey(): Promise<SigningKey> {
  // Extractable, so a test can serve the public half as core's JWKS.
  const { privateKey, publicKey } = await generateKeyPair("EdDSA", {
    crv: "Ed25519",
    extractable: true,
  });

  const token = (ageSeconds = 0, holder: Holder = owner) => {
    const iat = Math.floor(Date.now() / 1000) - ageSeconds;
    const roles = holder.kind === "guest" ? { roles: holder.roles } : {};
    return new SignJWT({ sid: "session-1", kind: holder.kind, ...roles })
      .setProtectedHeader({ alg: "EdDSA", kid: "key-1" })
      .setSubject(holder.id)
      .setIssuedAt(iat)
      .setExpirationTime(iat + sessionTokenLifetimeSeconds)
      .sign(privateKey);
  };

  const cookieFor = async ({ session, guestRoles }: ConformanceCase) => {
    const value = {
      "signed-out": undefined,
      expired: () => token(expiredAgeSeconds),
      owner: () => token(),
      guest: () => token(0, guest(guestRoles)),
    }[session];
    return value ? { cookie: `${sessionCookie}=${await value()}` } : {};
  };

  return { publicKey, token, cookieFor };
}
