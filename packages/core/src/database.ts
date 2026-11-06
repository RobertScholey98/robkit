import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

type Connection = ReturnType<typeof connect>;

/**
 * Core's connection to its schema, as core's role. Make it with
 * `createDatabase` and hand it to `createApp`, `ensureSigningKey` and
 * `registerApps`; core's own code is the only one that queries it.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the interface names Drizzle's type as core's own, so core's API doesn't print Drizzle's
export interface Database extends Connection {}

function connect(databaseUrl: string) {
  return drizzle({
    client: postgres(databaseUrl, { onnotice: () => undefined }),
  });
}

/** Connects to core's schema as core's role. */
export function createDatabase(databaseUrl: string): Database {
  return connect(databaseUrl);
}
