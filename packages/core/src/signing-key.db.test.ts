import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { signingKeys } from "./schema.ts";
import { ensureSigningKey } from "./signing-key.ts";
import { aCoreOrigin } from "@internal/test-session";
import { createApp } from "./app.ts";
import { createDatabase, type Database } from "./database.ts";
import { defaultOrigin, freshCore } from "./test/fresh-app.ts";

/** The URL `db` connects with, for a second connection to the same database. */
function databaseUrlOf(db: Database): string {
  const { host, port, database, user, pass } = db.$client.options;
  return `postgres://${user}:${String(pass)}@${host[0] ?? ""}:${String(port[0])}/${database}`;
}

describe("ensureSigningKey", () => {
  it("creates a key once and loads it after that", async () => {
    const { db } = await freshCore();

    const first = await ensureSigningKey(db);
    const second = await ensureSigningKey(db);

    expect(second.kid).toBe(first.kid);
  });

  it("creates one key when several boots race", async () => {
    const { db } = await freshCore();

    const keys = await Promise.all(
      Array.from({ length: 5 }, () => ensureSigningKey(db)),
    );

    expect(new Set(keys.map((key) => key.kid)).size).toBe(1);
    expect(
      await db.execute(
        sql`select count(*)::int as count from core.signing_keys`,
      ),
    ).toEqual([{ count: 1 }]);
  });

  it("waits on core's table while another boot creates the key, holding no advisory lock", async () => {
    const { db } = await freshCore();
    const other = createDatabase(databaseUrlOf(db));
    try {
      let loading: Promise<unknown> | undefined;
      await other.transaction(async (tx) => {
        await tx.execute(sql`lock table core.signing_keys in exclusive mode`);
        loading = ensureSigningKey(db);
        await expect
          .poll(async () =>
            db.execute(
              sql`select count(*)::int as n from pg_locks where not granted and relation = 'core.signing_keys'::regclass`,
            ),
          )
          .toEqual([{ n: 1 }]);

        expect(
          await db.execute(
            sql`select count(*)::int as n from pg_locks where locktype = 'advisory'`,
          ),
        ).toEqual([{ n: 0 }]);
      });
      await loading;
    } finally {
      await other.$client.end();
    }
  });

  it("refuses a stored key that is a shared secret, not an EdDSA key", async () => {
    const { db } = await freshCore();
    const secret = { kty: "oct", k: "c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0" };
    await db.insert(signingKeys).values({
      kid: "secret",
      privateJwk: secret,
      publicJwk: secret,
    });

    await expect(ensureSigningKey(db)).rejects.toThrow(
      "Core's signing key secret in core.signing_keys is a shared secret, not an EdDSA key. Core only writes EdDSA keys, so check what else wrote to that table.",
    );
  });
});

describe("GET /.well-known/jwks.json", () => {
  it("publishes the key core was handed, so a sign-in needn't load one", async () => {
    const { db } = await freshCore();
    const elsewhere = await freshCore();
    const signingKey = await ensureSigningKey(elsewhere.db);
    const app = createApp({
      db,
      origin: aCoreOrigin(defaultOrigin),
      signingKey,
    });

    const res = await app.request("/.well-known/jwks.json");
    const { keys } = (await res.json()) as { keys: { kid: string }[] };

    expect(keys.map((key) => key.kid)).toEqual([signingKey.kid]);
    expect(
      await db.execute(sql`select count(*)::int as n from core.signing_keys`),
    ).toEqual([{ n: 0 }]);
  });

  it("publishes the public half of core's signing key", async () => {
    const { app, db } = await freshCore();
    const { kid } = await ensureSigningKey(db);

    const res = await app.request("/.well-known/jwks.json");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      keys: [
        {
          kty: "OKP",
          crv: "Ed25519",
          x: expect.stringMatching(/^[\w-]{43}$/) as string,
          kid,
          alg: "EdDSA",
          use: "sig",
        },
      ],
    });
  });

  it("creates the key when nothing created it first", async () => {
    const { app, db } = await freshCore();

    const res = await app.request("/.well-known/jwks.json");
    const { keys } = (await res.json()) as { keys: { kid: string }[] };

    expect(keys.map((key) => key.kid)).toEqual([
      (await ensureSigningKey(db)).kid,
    ]);
  });
});
