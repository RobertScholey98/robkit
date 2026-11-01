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

// Core trusts the proxy's X-Forwarded-For, so only the proxy may reach it.
// A container sets HOST to listen beyond loopback.
const hostname = process.env.HOST ?? "127.0.0.1";

serve({ fetch: app.fetch, hostname, port: Number(env("PORT")) }, ({ port }) => {
  console.log(`core listening on ${hostname}:${String(port)}`);
});
