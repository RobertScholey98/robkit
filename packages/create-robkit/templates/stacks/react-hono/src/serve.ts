import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { orExit, readServeEnv } from "@robkit/input";
import { Hono } from "hono";
import server from "./server.tsx";

// The app in production, built into dist by vite build: the stylesheet its
// page links, then the guarded app. A container sets HOST to listen beyond
// loopback.
const app = new Hono();
app.use("/assets/*", serveStatic({ root: "dist" }));
app.route("/", server);

const listen = orExit(readServeEnv(process.env));
const { host: hostname, port } = listen;

serve({ fetch: app.fetch, hostname, port }, ({ port }) => {
  console.log(`listening on ${hostname}:${String(port)}`);
});
