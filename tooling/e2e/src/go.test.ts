import { describeJourneys } from "./install-journeys.ts";

// The Go example calls its API from its page with sessionFetch, and its
// server passes Vite's hot-update socket through the guard under pnpm dev.
describeJourneys("go", { serverFunction: true, posts: true, viteSocket: true });
