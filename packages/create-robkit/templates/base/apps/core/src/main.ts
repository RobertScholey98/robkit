import { serve } from "@hono/node-server";
import {
  createApp,
  createDatabase,
  ensureSigningKey,
  readCoreConfig,
  registerApps,
} from "@robkit/core";
import { orExit } from "@robkit/input";

const config = orExit(readCoreConfig(process.env));

const db = createDatabase(config.databaseUrl);
await ensureSigningKey(db);
// The owner's apps, as each declares itself. Core adds any it doesn't know,
// with the rule it declares or as owner-only.
await registerApps(db, config.apps);
const app = createApp({
  db,
  origin: config.origin,
  // Set to cloudflare behind a Cloudflare tunnel, so the sign-in limits
  // count each visitor. Only when nothing but the tunnel reaches the host.
  trustedProxy: config.trustedProxy,
});

// Core trusts the proxy's X-Forwarded-For, so only the proxy may reach it.
// A container sets HOST to listen beyond loopback.
const { host: hostname, port } = config;

serve({ fetch: app.fetch, hostname, port }, ({ port }) => {
  console.log(`core listening on ${hostname}:${String(port)}`);
});
