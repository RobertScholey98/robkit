import { isProblem } from "@robkit/session/input";
import { readGuardEnv } from "@robkit/session/app-env";
import { guarded, type GuardedContext } from "@robkit/start";
import entry from "@tanstack/react-start/server-entry";

// Routes and server functions read the guard's viewer as context.viewer.
declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: GuardedContext };
  }
}

// The app's slug and core's address, which pnpm dev and robkit deploy set.
const guard = readGuardEnv(process.env);
if (isProblem(guard)) throw new Error(guard.error);

// The rule is the one the owner set for this app in admin.
export default guarded(entry, guard);
