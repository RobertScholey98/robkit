import { serve } from "@hono/node-server";
import { createApp, createDatabase, ensureSigningKey } from "@robkit/core";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const db = createDatabase(env("DATABASE_URL"));
await ensureSigningKey(db);
const app = createApp({ db, domain: env("ROBKIT_DOMAIN") });

serve({ fetch: app.fetch, port: Number(env("PORT")) }, ({ port }) => {
  console.log(`core listening on ${String(port)}`);
});
