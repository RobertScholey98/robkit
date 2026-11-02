import { sessionFetch } from "@robkit/react";
import { createStart } from "@tanstack/react-start";

// A server function called once the session has lapsed sends the browser
// through core's refresh and back, rather than failing.
export const startInstance = createStart(() => ({
  serverFns: { fetch: sessionFetch },
}));
