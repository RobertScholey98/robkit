import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { discoverApps } from "./apps.ts";
import { exec } from "./exec.ts";
import { slugProblem } from "./slug.ts";

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
): Promise<Map<string, string>> {
  const databaseUrls = new Map<string, string>();
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

/**
 * Gives an app its own schema and a login role that can touch nothing else,
 * both named after the app's slug. Safe to run on every start: it converges
 * on the same grants and sets a fresh password each time.
 *
 * @param adminUrl a superuser URL for the install's database
 * @returns the app's `DATABASE_URL`
 */
export async function provisionDatabase(
  adminUrl: string,
  slug: string,
): Promise<string> {
  const problem = slugProblem(slug);
  if (problem) throw new Error(problem);
  const password = randomBytes(24).toString("hex");
  const role = `"${slug}"`;
  const sql = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  try {
    await sql.begin(async (tx) => {
      const [existing] =
        await tx`select 1 from pg_roles where rolname = ${slug}`;
      const verb = existing ? "alter" : "create";
      await tx.unsafe(
        `${verb} role ${role} with login nosuperuser nocreatedb nocreaterole password '${password}'`,
      );
      const [{ database } = { database: "" }] = await tx<
        { database: string }[]
      >`select current_database() as database`;
      await tx.unsafe(
        `create schema if not exists ${role} authorization ${role}`,
      );
      await tx.unsafe(`alter role ${role} set search_path = ${role}`);
      await tx.unsafe(`revoke all on database "${database}" from public`);
      await tx.unsafe(`grant connect on database "${database}" to ${role}`);
      await tx.unsafe(`revoke all on schema public from public`);
    });
  } finally {
    await sql.end();
  }

  const url = new URL(adminUrl);
  url.username = slug;
  url.password = password;
  return url.href;
}
