import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

/**
 * Core's connection to its schema, as core's role. Make it with
 * `createDatabase` and hand it to `createApp`, `ensureSigningKey` and
 * `registerApps`; core's own code is the only one that queries it.
 */
export type Database = ReturnType<typeof connect>;

function connect(databaseUrl: string) {
  return drizzle({
    client: postgres(databaseUrl, { onnotice: () => undefined }),
  });
}

/** Connects to core's schema as core's role. */
export function createDatabase(databaseUrl: string): Database {
  return connect(databaseUrl);
}

/**
 * The row an insert gave back, or a fault naming `what` core was storing
 * and the `table`. An insert with `returning` always gives one back, so this
 * fails only if something under core broke.
 */
export function storedRow<T>(
  row: T | undefined,
  what: string,
  table: string,
): T {
  if (row === undefined) {
    throw new Error(
      `Core couldn't store ${what}: the insert into ${table} returned no row.`,
    );
  }
  return row;
}
