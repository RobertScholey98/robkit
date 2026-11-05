import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { isProblem, readServeEnv } from "@robkit/session/input";
import { Hono } from "hono";
import admin from "./server.ts";

// Admin in production: the client's built files, then admin's guarded page.
const app = new Hono();
app.use("/assets/*", serveStatic({ root: "dist/client" }));
app.route("/", admin);

// A container sets HOST to listen beyond loopback.
const listen = readServeEnv(process.env);
if (isProblem(listen)) {
  console.error(listen.error);
  process.exit(1);
}
const { host: hostname, port } = listen;

serve({ fetch: app.fetch, hostname, port }, ({ port }) => {
  console.log(`admin listening on ${hostname}:${String(port)}`);
});
