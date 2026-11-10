import { guarded, type GuardedEnv } from "@robkit/hono";
import { Hono } from "hono";
import { routes } from "./routes.tsx";
import { visits } from "./visits.ts";

const app = new Hono<GuardedEnv>();

// The guard reads the app's slug and core's address, which pnpm dev and
// robkit deploy set. The rule is the one the owner set for this app in
// admin.
app.use(guarded());

// The routes store visits in the database. A test passes its own.
app.route("/", routes(visits));

export default app;
