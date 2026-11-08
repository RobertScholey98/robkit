import { asc, sql } from "drizzle-orm";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
  type CryptoKey,
  type JWK,
} from "jose";
import { storedRow, type Database } from "./database.ts";
import { signingKeys } from "./schema.ts";

/** Stored EdDSA key `kid`, ready to sign or verify with. */
async function importKey(kid: string, jwk: JWK): Promise<CryptoKey> {
  const key = await importJWK(jwk, "EdDSA");
  if (key instanceof Uint8Array) {
    throw new Error(
      `Core's signing key ${kid} in core.signing_keys is a shared secret, not an EdDSA key. Core only writes EdDSA keys, so check what else wrote to that table.`,
    );
  }
  return key;
}

/** Core's Ed25519 key, which signs every session token. */
export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicJwk: JWK;
}

// Any constant works; it only has to be the same in every core process.
const signingKeyLock = 0x5167_6b65;

/**
 * Loads core's signing key, creating it the first time. Safe to call from
 * several processes at once: they all end up with the same key.
 */
export async function ensureSigningKey(db: Database): Promise<SigningKey> {
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${signingKeyLock})`);
    const [existing] = await tx
      .select()
      .from(signingKeys)
      .orderBy(asc(signingKeys.createdAt))
      .limit(1);
    if (existing) return existing;

    const pair = await generateKeyPair("EdDSA", {
      crv: "Ed25519",
      extractable: true,
    });
    const publicJwk = await exportJWK(pair.publicKey);
    const kid = await calculateJwkThumbprint(publicJwk);
    const [inserted] = await tx
      .insert(signingKeys)
      .values({
        kid,
        privateJwk: await exportJWK(pair.privateKey),
        publicJwk,
      })
      .returning();
    return storedRow(
      inserted,
      `its new signing key ${kid}`,
      "core.signing_keys",
    );
  });

  return {
    kid: row.kid,
    privateKey: await importKey(row.kid, row.privateJwk),
    publicKey: await importKey(row.kid, row.publicJwk),
    publicJwk: row.publicJwk,
  };
}
