import { serve } from "@robkit/start/serve";

// The app in production: its built files, then Start's server entry, which
// is src/server.ts with robkit's guard. Code of your own goes before the
// call.
await serve();
