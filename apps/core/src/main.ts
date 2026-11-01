import { serve } from "@hono/node-server";
import { createApp, createDatabase } from "@robkit/core";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const db = createDatabase(env("DATABASE_URL"));
const app = createApp({ db, domain: process.env.ROBKIT_DOMAIN ?? "localhost" });

serve({ fetch: app.fetch, port: Number(env("PORT")) }, ({ port }) => {
  console.log(`core listening on ${String(port)}`);
});
