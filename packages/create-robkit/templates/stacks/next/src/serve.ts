import { serve } from "@robkit/next/serve";

// The app in production, as next build left it in dist. Next serves its
// pages and files, and runs src/proxy.ts, robkit's guard, before them.
// Code of your own goes before the call.
await serve();
