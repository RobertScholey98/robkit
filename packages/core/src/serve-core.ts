import { getRequestListener } from "@hono/node-server";
import { isProblem, type Env } from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";
import { createApp } from "./app.ts";
import { registerApps } from "./apps.ts";
import { createDatabase } from "./database.ts";
import { readCoreConfig } from "./env.ts";
import { listenUntilStopped } from "@robkit/serve";
import { ensureSigningKey } from "./signing-key.ts";

/**
 * How long a query still running gets once the server has stopped, in
 * seconds. Its request is gone by then: the client gave up, or the stop's
 * limit closed its connection. postgres.js waits for every query unless
 * told how long. The server's stop takes up to 8 seconds, and Docker kills
 * a container at 10.
 */
const queryLimit = 1;

/**
 * Serves core from its environment until SIGTERM or SIGINT: loads its
 * signing key, makes its catalog hold exactly the apps in `ROBKIT_APPS`,
 * then listens on `HOST` and `PORT`. Core's schema must be migrated first.
 *
 * @returns the exit code once core has stopped
 */
export async function serveCore(env: Env): Promise<number> {
  const config = readCoreConfig(env);
  if (isProblem(config)) throw new CommandProblem(config.error);
  const db = createDatabase(config.databaseUrl);
  const app = await (async () => {
    try {
      // Loaded before core listens, so no sign-in waits on it.
      const signingKey = await ensureSigningKey(db);
      // The owner's apps, as each declares itself. Core adds the new ones
      // and deletes the ones the list leaves out. Only here, once: a core
      // already serving leaves the catalog to the one that starts after it.
      await registerApps(db, config.apps);
      return createApp({
        db,
        origin: config.origin,
        trustedProxy: config.trustedProxy,
        signingKey,
      });
    } catch (error) {
      await db.$client.end();
      throw error;
    }
  })();
  // Core trusts the proxy's X-Forwarded-For, so only the proxy may reach
  // it. A container sets HOST to listen beyond loopback.
  return listenUntilStopped(getRequestListener(app.fetch), {
    hostname: config.host,
    port: config.port,
    name: "core",
    onStopped: () => db.$client.end({ timeout: queryLimit }),
  });
}
