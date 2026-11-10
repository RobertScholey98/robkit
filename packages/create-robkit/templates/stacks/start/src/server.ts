import { guarded, type GuardedContext } from "@robkit/start";
import entry from "@tanstack/react-start/server-entry";

// Routes and server functions read the guard's viewer as context.viewer.
declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: GuardedContext };
  }
}

// The guard reads the app's slug and core's address, which pnpm dev and
// robkit deploy set. The rule is the one the owner set for this app in
// admin.
export default guarded(entry);
