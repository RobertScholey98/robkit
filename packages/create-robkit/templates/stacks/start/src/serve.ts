import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

interface ServerEntry {
  fetch: (request: Request) => Promise<Response>;
}

// The app in production, as vite build left it in dist: the client's files,
// then Start's server entry, which is src/server.ts with robkit's guard.
const built = new URL("../dist/server/server.js", import.meta.url).href;
const { default: entry } = (await import(built)) as { default: ServerEntry };

const app = new Hono();
app.use("*", serveStatic({ root: "dist/client" }));
app.all("*", (c) => entry.fetch(c.req.raw));

// A container sets HOST to listen beyond loopback.
const hostname = process.env.HOST ?? "127.0.0.1";

serve(
  { fetch: app.fetch, hostname, port: Number(process.env.PORT ?? "3000") },
  ({ port }) => {
    console.log(`listening on ${hostname}:${String(port)}`);
  },
);
