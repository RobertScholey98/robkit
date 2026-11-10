import { join } from "node:path";
import type { Domain, Slug } from "@robkit/input";
import { CommandProblem } from "@robkit/input/command";
import type { App } from "./apps.ts";
import { readEnvFile } from "./env.ts";
import { throwFailures } from "./failures.ts";

/** What `robkit-dev` tells every app about the install it runs in. */
export interface InstallFacts {
  domain: Domain;
  /** Core's address, such as `http://core.robkit.localhost:3000`. */
  coreUrl: string;
  /** `ROBKIT_APPS`, from `catalogOf`. */
  catalog: string;
}

/**
 * What `robkit-dev` decides for one app and its `migrate` script, over the
 * shell's environment. A name without a value is one it removes. Every name
 * an app's environment gets from the runner rather than the shell is a key
 * here.
 */
export function appSettings(
  install: InstallFacts,
  app: Pick<App, "slug" | "port">,
  databaseUrl?: string,
): Record<string, string | undefined> {
  return {
    ROBKIT_DOMAIN: install.domain,
    ROBKIT_CORE_URL: install.coreUrl,
    ROBKIT_APPS: install.catalog,
    ROBKIT_APP: app.slug,
    PORT: String(app.port),
    // Core and the Go stack listen on HOST, and a HOST the shell exports
    // would reach them. The proxy reaches every app on loopback.
    HOST: "127.0.0.1",
    // The app's own database, and no URL meant for the runner or another
    // app. An app without a database gets none.
    DATABASE_URL: databaseUrl,
    ROBKIT_DATABASE_URL: undefined,
    // An app pnpm dev runs is no test run, even when a test started pnpm
    // dev. Under VITEST, robkit() in an app's Vite config sets nothing up,
    // and the app would listen on the wrong port.
    VITEST: undefined,
  };
}

/**
 * What `robkit-dev` sets for an app only where neither the shell nor the
 * app's `.env` has. next dev reads `NEXT_TELEMETRY_DISABLED` before it loads
 * any config, so a Next app's own next.config.ts can't turn its telemetry
 * off. Here it works on Windows too, where a script's VAR=value prefix
 * doesn't.
 */
const appDefaults = { NEXT_TELEMETRY_DISABLED: "1" };

/**
 * The environment `robkit-dev` gives an app, and its `migrate` script:
 * the runner's settings win, then the shell's, then the app's own, from
 * its `.env`, then the runner's defaults.
 */
export function appEnv(
  install: InstallFacts,
  shell: NodeJS.ProcessEnv,
  app: Pick<App, "slug" | "port">,
  {
    own = {},
    databaseUrl,
  }: {
    own?: Record<string, string> | undefined;
    databaseUrl?: string | undefined;
  } = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...appDefaults,
    ...own,
    ...shell,
    ...appSettings(install, app, databaseUrl),
  };
  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined),
  );
}

/**
 * Why an app's `.env` can't set `name`, or undefined when it may. A name
 * the runner decides would lose to it unseen. `NODE_ENV`, like `VITEST`,
 * decides whether `guardedAs()` serves, so a file that set it would open
 * the app.
 */
function whyRefused(
  install: InstallFacts,
  app: Pick<App, "slug" | "port">,
  name: string,
): string | undefined {
  if (Object.hasOwn(appSettings(install, app), name)) {
    return `which pnpm dev decides for each app. Remove it from the file.`;
  }
  if (name.startsWith("ROBKIT_")) {
    return `and a name that starts ROBKIT_ is robkit's own. Remove it from the file. robkit's settings for pnpm dev go in the .env at the install's root.`;
  }
  if (name === "NODE_ENV") {
    return `which decides whether a test helper such as guardedAs() serves. Remove it from the file.`;
  }
  return undefined;
}

/**
 * Each app's own settings, by slug: what `apps/<slug>/.env` sets, or
 * nothing when it has none. Read once, as `pnpm dev` starts.
 *
 * @throws a `CommandProblem` for each name a file sets that robkit
 *   decides, several in an AggregateError
 */
export async function ownSettings(
  install: InstallFacts,
  apps: readonly Pick<App, "slug" | "port" | "dir">[],
): Promise<Map<Slug, Record<string, string>>> {
  const refused: CommandProblem[] = [];
  const own = new Map<Slug, Record<string, string>>();
  for (const app of apps) {
    const settings = await readEnvFile(join(app.dir, ".env"));
    for (const name of Object.keys(settings)) {
      const why = whyRefused(install, app, name);
      if (why !== undefined) {
        refused.push(
          new CommandProblem(`apps/${app.slug}/.env sets ${name}, ${why}`),
        );
      }
    }
    own.set(app.slug, settings);
  }
  throwFailures(refused);
  return own;
}
