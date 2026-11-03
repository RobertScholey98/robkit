import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// pnpm db:migration <name> writes the next migration: the SQL that takes the
// app's schema, as the local database holds it, to prisma/schema.prisma. Run
// it with pnpm dev running, so the app's earlier migrations have run. Then it
// regenerates the client.

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  throw new Error(
    "Name the migration in lowercase letters, digits and underscores, such as pnpm db:migration add_notes.",
  );
}

// The local Postgres pnpm dev runs, as its superuser, unless DATABASE_URL
// says otherwise.
const port = process.env.ROBKIT_POSTGRES_PORT ?? "54320";
const env = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL ??
    `postgres://postgres:postgres@127.0.0.1:${port}/robkit`,
};
const stamp = new Date().toISOString().replaceAll(/\D/g, "").slice(0, 14);
const dir = `prisma/migrations/${stamp}_${name}`;
mkdirSync(dir, { recursive: true });
execSync(
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script --output ${dir}/migration.sql`,
  { env, stdio: "inherit" },
);
execSync("prisma generate", { env, stdio: "inherit" });
console.log(`wrote ${dir}/migration.sql`);
