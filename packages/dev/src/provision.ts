import type { Slug } from "@robkit/input";
import { provisionDatabase } from "@robkit/provision";
import { CommandProblem } from "@robkit/input/command";
import type { App } from "./apps.ts";
import { exec } from "./exec.ts";

export interface ProvisionOptions {
  /** A superuser URL for the install's database. */
  adminUrl: string;
  /** The environment `app`'s `migrate` script runs in, given its `DATABASE_URL`. */
  envFor: (app: App, databaseUrl: string) => NodeJS.ProcessEnv;
  /**
   * Once aborted, the migrate script that is running is stopped and no
   * further app is provisioned.
   */
  signal?: AbortSignal;
}

/**
 * The provision step: gives each of `apps` that has a `migrate` script
 * its database, then runs that script as the app. Apps go one at a time,
 * in the order given, and the step stops at the first failure: an app it
 * refuses is a `CommandProblem` that names it. Safe to run on every start:
 * a second run changes nothing but the passwords.
 *
 * @returns each provisioned app's `DATABASE_URL`, by slug
 */
export async function provisionApps(
  apps: readonly App[],
  { adminUrl, envFor, signal }: ProvisionOptions,
): Promise<Map<Slug, string>> {
  const databaseUrls = new Map<Slug, string>();
  for (const app of apps) {
    if (signal?.aborted) break;
    if (!app.migrates) continue;
    const provisioned = await provisionDatabase(adminUrl, app.slug);
    if (provisioned.outcome !== "provisioned") {
      throw new CommandProblem(
        `pnpm dev can't give ${app.slug} its database. ${provisioned.error} Rename apps/${app.slug}.`,
      );
    }
    const { databaseUrl } = provisioned;
    await exec("pnpm", ["run", "migrate"], {
      cwd: app.dir,
      env: envFor(app, databaseUrl),
      slug: app.slug,
      signal,
    });
    // Stopped part way, the app isn't migrated.
    if (signal?.aborted) break;
    databaseUrls.set(app.slug, databaseUrl);
  }
  return databaseUrls;
}
