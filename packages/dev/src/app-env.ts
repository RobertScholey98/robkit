import { join } from "node:path";
import type { Domain, Slug } from "@robkit/input";
import type { App } from "./apps.ts";
import { readEnvFile } from "./env.ts";

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
    // next dev reads it before it loads any config, so a Next app's own
    // next.config.ts can't turn its telemetry off. Here it works on Windows
    // too, where a script's VAR=value prefix doesn't.
    NEXT_TELEMETRY_DISABLED: "1",
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
 * The environment `robkit-dev` gives an app, and its `migrate` script:
 * the runner's settings win, then the shell's, then the app's own, from
 * its `.env`.
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
  const env = { ...own, ...shell, ...appSettings(install, app, databaseUrl) };
  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined),
  );
}

/**
 * Each app's own settings, by slug: what `apps/<slug>/.env` sets, or
 * nothing when it has none. Read once, as `pnpm dev` starts.
 */
export async function ownSettings(
  install: InstallFacts,
  apps: readonly Pick<App, "slug" | "port" | "dir">[],
): Promise<Map<Slug, Record<string, string>>> {
  return new Map(
    await Promise.all(
      apps.map(
        async (app) =>
          [app.slug, await readEnvFile(join(app.dir, ".env"))] as const,
      ),
    ),
  );
}
