import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

// The hub in production: the files Vite built into dist, and its page for
// every other path, so an intro link (/i/<code>) loads the same page as /.
const app = new Hono();
app.use("*", serveStatic({ root: "dist" }));
app.get("*", serveStatic({ path: "dist/index.html" }));

// A container sets HOST to listen beyond loopback.
const hostname = process.env.HOST ?? "127.0.0.1";

serve(
  { fetch: app.fetch, hostname, port: Number(process.env.PORT ?? "3000") },
  ({ port }) => {
    console.log(`hub listening on ${hostname}:${String(port)}`);
  },
);
