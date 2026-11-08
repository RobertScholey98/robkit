import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { isRecord, orExit, readServeEnv } from "@robkit/input";
import { Hono } from "hono";

interface ServerEntry {
  fetch: (request: Request) => Promise<Response>;
}

function isServerEntry(value: unknown): value is ServerEntry {
  return isRecord(value) && typeof value.fetch === "function";
}

// The app in production, as vite build left it in dist: the client's files,
// then Start's server entry, which is src/server.ts with robkit's guard.
const built = new URL("../dist/server/server.js", import.meta.url).href;
const loaded: unknown = await import(built);
const entry = isRecord(loaded) ? loaded.default : undefined;
if (!isServerEntry(entry)) {
  throw new Error(`${built} has no server entry. Run the app's build.`);
}

const app = new Hono();
app.use("*", serveStatic({ root: "dist/client" }));
app.all("*", (c) => entry.fetch(c.req.raw));

// A container sets HOST to listen beyond loopback.
const listen = orExit(readServeEnv(process.env));
const { host: hostname, port } = listen;

serve({ fetch: app.fetch, hostname, port }, ({ port }) => {
  console.log(`listening on ${hostname}:${String(port)}`);
});
