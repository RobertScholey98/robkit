import { provisionDatabases } from "@robkit/dev";

// The provision step in production. Core's container runs it before core
// migrates and starts, and core's own process never sees the admin URL or
// the secret. It gives every app with a database its schema and role, whose
// password comes from ROBKIT_DB_SECRET.

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const slugs = env("ROBKIT_DATABASES")
  .split(",")
  .map((slug) => slug.trim())
  .filter((slug) => slug !== "");

await provisionDatabases({
  adminUrl: env("ROBKIT_ADMIN_DATABASE_URL"),
  secret: env("ROBKIT_DB_SECRET"),
  slugs,
});
console.log(`provisioned ${slugs.join(", ")}`);
