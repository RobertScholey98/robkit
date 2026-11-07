import { orExit, readGuardEnv } from "@robkit/input";
import { guarded } from "@robkit/next";

// Next runs this before every page, route handler and server action the
// matcher covers, on Node. The app's slug and core's address are what
// pnpm dev and robkit deploy set. The rule is the one the owner set for
// this app in admin.
export const proxy = guarded(orExit(readGuardEnv(process.env)));

// Every path but Next's own files. Next reads this where it is written, so
// it stays a literal here. viewer() throws on a path it leaves out.
export const config = { matcher: ["/((?!_next/).*)"] };
