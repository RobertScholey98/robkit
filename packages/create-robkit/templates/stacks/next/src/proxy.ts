import { guarded } from "@robkit/next";

// Next runs this before every page, route handler and server action the
// matcher covers, on Node. The guard reads the app's slug and core's
// address, which pnpm dev and robkit deploy set. The rule is the one the
// owner set for this app in admin.
export const proxy = guarded();

// Every path but Next's own files. Next reads this where it is written, so
// it stays a literal here. viewer() throws on a path it leaves out.
export const config = { matcher: ["/((?!_next/).*)"] };
