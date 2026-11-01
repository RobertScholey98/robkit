import { asc, sql } from "drizzle-orm";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
  type CryptoKey,
  type JWK,
} from "jose";
import type { Database } from "./database.ts";
import { signingKeys } from "./schema.ts";

/** Core's Ed25519 key, which signs every session token. */
export interface SigningKey {
  kid: string;
  privateKey: CryptoKey;
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
    const [created] = await tx
      .insert(signingKeys)
      .values({
        kid: await calculateJwkThumbprint(publicJwk),
        privateJwk: await exportJWK(pair.privateKey),
        publicJwk,
      })
      .returning();
    if (!created) throw new Error("Core couldn't store its signing key.");
    return created;
  });

  return {
    kid: row.kid,
    privateKey: (await importJWK(row.privateJwk, "EdDSA")) as CryptoKey,
    publicJwk: row.publicJwk,
  };
}
