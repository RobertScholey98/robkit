import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import server from "./server.tsx";

// The app in production, built into dist by vite build: the stylesheet its
// page links, then the guarded app. A container sets HOST to listen beyond
// loopback.
const app = new Hono();
app.use("/assets/*", serveStatic({ root: "dist" }));
app.route("/", server);

const hostname = process.env.HOST ?? "127.0.0.1";

serve(
  { fetch: app.fetch, hostname, port: Number(process.env.PORT ?? "3000") },
  ({ port }) => {
    console.log(`listening on ${hostname}:${String(port)}`);
  },
);
