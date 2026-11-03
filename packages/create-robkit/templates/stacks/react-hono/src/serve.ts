import { serve } from "@hono/node-server";
import app from "./server.tsx";

// The app in production, built into dist by vite build. A container sets
// HOST to listen beyond loopback.
const hostname = process.env.HOST ?? "127.0.0.1";

serve(
  { fetch: app.fetch, hostname, port: Number(process.env.PORT ?? "3000") },
  ({ port }) => {
    console.log(`listening on ${hostname}:${String(port)}`);
  },
);
