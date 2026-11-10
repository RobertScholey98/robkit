import { serve } from "@robkit/hono/serve";
import server from "./server.tsx";

// The app in production: its built files, then the app. Code of your own
// goes before the call.
serve(server);
