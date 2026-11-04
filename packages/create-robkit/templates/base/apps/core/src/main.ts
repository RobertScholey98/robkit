import { serve } from "@hono/node-server";
import {
  createApp,
  createDatabase,
  ensureSigningKey,
  readDeclaredApps,
  readTrustedProxy,
  registerApps,
} from "@robkit/core";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const db = createDatabase(env("DATABASE_URL"));
await ensureSigningKey(db);
// The owner's apps, as each declares itself. Core adds any it doesn't know,
// with the rule it declares or as owner-only.
await registerApps(db, readDeclaredApps(process.env.ROBKIT_APPS));
const app = createApp({
  db,
  domain: env("ROBKIT_DOMAIN"),
  // Set to cloudflare behind a Cloudflare tunnel, so the sign-in limits
  // count each visitor. Only when nothing but the tunnel reaches the host.
  trustedProxy: readTrustedProxy(process.env.ROBKIT_TRUSTED_PROXY),
});

// Core trusts the proxy's X-Forwarded-For, so only the proxy may reach it.
// A container sets HOST to listen beyond loopback.
const hostname = process.env.HOST ?? "127.0.0.1";

serve({ fetch: app.fetch, hostname, port: Number(env("PORT")) }, ({ port }) => {
  console.log(`core listening on ${hostname}:${String(port)}`);
});
