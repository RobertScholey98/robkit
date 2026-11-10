import { serve } from "@robkit/hono/serve";
import admin from "./server.ts";

// Admin in production: the client's built files, which are in dist/client,
// then admin's guarded page.
serve(admin, { assets: "dist/client/assets", name: "admin" });
