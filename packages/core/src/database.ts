import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type Database = ReturnType<typeof createDatabase>;

/** Connects to core's schema as core's role. */
export function createDatabase(databaseUrl: string) {
  return drizzle({
    client: postgres(databaseUrl, { onnotice: () => undefined }),
  });
}
