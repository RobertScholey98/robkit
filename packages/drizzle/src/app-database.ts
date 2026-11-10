import { orExit, readDatabaseUrl } from "@robkit/input";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/** The app's Drizzle database, with the postgres.js client under it. */
export type AppDatabase<TSchema extends Record<string, unknown>> =
  PostgresJsDatabase<TSchema> & { $client: postgres.Sql };

/** postgres.js's options, which `appDatabase` passes on. */
export type PoolOptions = postgres.Options<
  Record<string, postgres.PostgresType>
>;

/**
 * Where the open pools live, one per `DATABASE_URL`: on `globalThis`, so a
 * dev server that loads this module again finds the pool it opened before.
 */
const poolsKey = Symbol.for("@robkit/drizzle pools");
const holder: typeof globalThis & {
  [poolsKey]?: Map<string, postgres.Sql>;
} = globalThis;

/**
 * The app's database, as its own role, for `schema`:
 *
 * ```ts nocheck
 * export const database = appDatabase(schema);
 * ```
 *
 * It reads `DATABASE_URL` and connects on the first call of the function it
 * returns, never when the module loads, so a build that loads the app with
 * no database set still works. When `DATABASE_URL` is missing or isn't a
 * postgres:// URL, that first call prints what to fix and ends the process
 * with 1, as every setting an app's server reads does.
 *
 * The pool, a postgres.js client, opens once per process. A dev server that
 * reloads the app's modules gets the same pool back, with the Drizzle
 * database built again from the schema it is handed now, so a table added
 * to `schema.ts` is there on the next request. `options` go to postgres.js
 * when the pool opens; by default it holds at most 2 connections.
 */
export function appDatabase<TSchema extends Record<string, unknown>>(
  schema: TSchema,
  options: PoolOptions = {},
): () => AppDatabase<TSchema> {
  let db: AppDatabase<TSchema> | undefined;
  return () => {
    db ??= drizzle({ client: pool(options), schema });
    return db;
  };
}

/** The open pool for `DATABASE_URL`, opened with `options` if it isn't. */
function pool(options: PoolOptions): postgres.Sql {
  const url = orExit(readDatabaseUrl(process.env));
  let pools = holder[poolsKey];
  if (pools === undefined) {
    pools = new Map();
    holder[poolsKey] = pools;
  }
  let client = pools.get(url);
  if (client === undefined) {
    client = postgres(url, { max: 2, ...options });
    pools.set(url, client);
  }
  return client;
}
