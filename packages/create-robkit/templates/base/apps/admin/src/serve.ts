import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import admin from "./server.ts";

// Admin in production: the client's built files, then admin's guarded page.
const app = new Hono();
app.use("/assets/*", serveStatic({ root: "dist/client" }));
app.route("/", admin);

// A container sets HOST to listen beyond loopback.
const hostname = process.env.HOST ?? "127.0.0.1";

serve(
  { fetch: app.fetch, hostname, port: Number(process.env.PORT ?? "3000") },
  ({ port }) => {
    console.log(`admin listening on ${hostname}:${String(port)}`);
  },
);
