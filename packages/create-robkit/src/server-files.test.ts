import { describe, expect, it } from "vitest";
import { readyStacks, type Stack } from "./choices.ts";
import { stackTemplate } from "./generate.ts";

/** Each stack's server file, and the one call that gets it its guard. */
const serverFile = {
  start: { path: "src/server.ts", call: "guarded(entry)" },
  "react-hono": { path: "src/server.tsx", call: "app.use(guarded())" },
  express: { path: "src/server.tsx", call: "app.use(guarded())" },
  next: { path: "src/proxy.ts", call: "export const proxy = guarded()" },
  go: {
    path: "server.go",
    call: "guarded, err := session.Guarded(session.Options{})",
  },
} satisfies Record<Stack, { path: string; call: string }>;

/** What an app would use to read the guard's settings by hand. */
const readsSettings =
  /@robkit\/input|ROBKIT_APP|ROBKIT_CORE_URL|readGuardEnv|ReadGuardEnv|readCoreUrl|orExit/;

describe("the server files", () => {
  it.each(readyStacks)(
    "gets a %s app its guard in one call, reading no setting itself",
    async (stack) => {
      const { path, call } = serverFile[stack];
      const file = (await stackTemplate(stack)).get(path) ?? "";

      expect(file).toContain(call);
      expect(file).not.toMatch(readsSettings);
    },
  );
});
