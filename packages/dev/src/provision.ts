import type { Slug } from "@robkit/input";
import { provisionDatabase } from "@robkit/provision";
import { discoverApps } from "./apps.ts";
import { exec } from "./exec.ts";

export interface ProvisionOptions {
  /** A superuser URL for the install's database. */
  adminUrl: string;
  /** The environment each app's `migrate` script runs in, plus its `DATABASE_URL`. */
  env?: NodeJS.ProcessEnv;
  /** Once aborted, no further app is provisioned. */
  signal?: AbortSignal;
}

/**
 * The provision step: gives every app in the install at `root` that has a
 * `migrate` script its database, then runs that script as the app. Apps go
 * one at a time in slug order, and the step stops at the first failure. Safe
 * to run on every start: a second run changes nothing but the passwords.
 *
 * @returns each provisioned app's `DATABASE_URL`, by slug
 */
export async function provisionApps(
  root: string,
  { adminUrl, env = process.env, signal }: ProvisionOptions,
): Promise<Map<Slug, string>> {
  const databaseUrls = new Map<Slug, string>();
  for (const app of await discoverApps(root)) {
    if (signal?.aborted) break;
    if (!app.migrates) continue;
    const databaseUrl = await provisionDatabase(adminUrl, app.slug);
    await exec("pnpm", ["run", "migrate"], {
      cwd: app.dir,
      env: { ...env, DATABASE_URL: databaseUrl },
      slug: app.slug,
    });
    databaseUrls.set(app.slug, databaseUrl);
  }
  return databaseUrls;
}
