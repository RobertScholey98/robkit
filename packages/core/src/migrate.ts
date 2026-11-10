import { fileURLToPath } from "node:url";
import { migrate as migrateSchema } from "@robkit/drizzle";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/**
 * Applies core's pending migrations, as core's role, keeping the journal in
 * `core.__drizzle_migrations`. Run it as its own step before core starts;
 * core never migrates at boot. It is the apps' migrator, from
 * `@robkit/drizzle`, so two cores that start together apply each
 * migration once, with no lock an app's role could hold.
 */
export function migrate(databaseUrl: string): Promise<void> {
  return migrateSchema({
    databaseUrl,
    folder: migrationsFolder,
    schema: "core",
  });
}
