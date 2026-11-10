import type { Domain } from "@robkit/input";
import type { App } from "./apps.ts";

/** What `robkit-dev` tells every app about the install it runs in. */
export interface InstallFacts {
  domain: Domain;
  /** Core's address, such as `http://core.robkit.localhost:3000`. */
  coreUrl: string;
  /** `ROBKIT_APPS`, from `catalogOf`. */
  catalog: string;
}

/**
 * What `robkit-dev` sets for every app and for each app's `migrate`
 * script, over the shell's environment.
 */
export function sharedSettings(install: InstallFacts): Record<string, string> {
  return {
    ROBKIT_DOMAIN: install.domain,
    ROBKIT_CORE_URL: install.coreUrl,
    ROBKIT_APPS: install.catalog,
    // next dev reads it before it loads any config, so a Next app's own
    // next.config.ts can't turn its telemetry off. Here it works on Windows
    // too, where a script's VAR=value prefix doesn't.
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

/**
 * What `robkit-dev` sets for one app it starts: the shared settings, its
 * slug, its port and, for an app with a database, its `DATABASE_URL`.
 * Every name an app's environment gets from the runner rather than the
 * shell is a key here.
 */
export function appSettings(
  install: InstallFacts,
  app: Pick<App, "slug" | "port">,
  databaseUrl?: string,
): Record<string, string> {
  return {
    ...sharedSettings(install),
    ROBKIT_APP: app.slug,
    PORT: String(app.port),
    ...(databaseUrl !== undefined && { DATABASE_URL: databaseUrl }),
  };
}

/**
 * The shell's environment as an app gets it, before the runner's settings:
 * without a database URL meant for the runner or another app, and without
 * VITEST. An app pnpm dev runs is no test run, even when a test started
 * pnpm dev. Under VITEST, robkit() in an app's Vite config sets nothing up,
 * and the app would listen on the wrong port.
 */
export function shellForApps(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const shell = { ...env };
  delete shell.ROBKIT_DATABASE_URL;
  delete shell.DATABASE_URL;
  delete shell.VITEST;
  return shell;
}
