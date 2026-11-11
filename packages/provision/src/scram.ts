import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

/**
 * The SCRAM-SHA-256 verifier of `password`, in the form Postgres stores in
 * `pg_authid.rolpassword` (RFC 5803):
 * `SCRAM-SHA-256$<iterations>:<salt>$<StoredKey>:<ServerKey>`, each part
 * base64. Postgres stores a verifier it is given as it stands, so a
 * statement can set a role's password without holding it.
 *
 * Postgres runs a password through SASLprep before it salts it, and this
 * doesn't. The two agree on every ASCII password, as every password robkit
 * makes is.
 *
 * @param salt a fresh 16 bytes unless given, as Postgres makes it
 * @param iterations Postgres's default `scram_iterations` unless given
 */
export function scramVerifier(
  password: string,
  salt: Buffer = randomBytes(16),
  iterations = 4096,
): string {
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const hmac = (text: string) =>
    createHmac("sha256", salted).update(text).digest();
  const storedKey = createHash("sha256").update(hmac("Client Key")).digest();
  const serverKey = hmac("Server Key");
  return `SCRAM-SHA-256$${String(iterations)}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}
