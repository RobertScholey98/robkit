import { createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { discoverApps, seedFile, type App } from "./apps.ts";
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
 * `migrate` script its database, then runs that script as the app. An app
 * whose schema this step made new then gets its seed, if its folder has a
 * `seed.sql`: SQL that runs once, as the app, and never again. Apps go one
 * at a time in slug order, and the step stops at the first failure. Safe to
 * run on every start: a second run changes nothing but the passwords.
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
    await seedOnce(app, databaseUrl);
    databaseUrls.set(app.slug, databaseUrl);
  }
  return databaseUrls;
}

/**
 * What a schema's comment says while its app's seed hasn't run. The provision
 * step sets it as it creates the schema, and the seed's own transaction
 * clears it, so a seed runs once even if migrating failed in between.
 */
const seedPending = "robkit: seed pending";

/** What the provision step and `robkit-seed` say when they run a seed. */
export const seededMessage = `ran ${seedFile} once, on its new schema`;

/**
 * Runs the app's seed if its schema still waits for it, as the app's role,
 * in one transaction with clearing the wait: a seed that fails leaves no rows
 * and runs again next time. `pnpm dev` runs it after migrating, and in
 * production each app's start script runs it as `robkit-seed`.
 *
 * @returns whether it ran a seed
 */
export async function seedOnce(
  app: Pick<App, "slug" | "dir" | "seeds">,
  databaseUrl: string,
): Promise<boolean> {
  let ran = false;
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
  try {
    await sql.begin(async (tx) => {
      const [schema] = await tx<{ note: string | null }[]>`
        select obj_description(oid, 'pg_namespace') as note
        from pg_namespace where nspname = ${app.slug}`;
      if (schema?.note !== seedPending) return;
      if (app.seeds) {
        const text = await readFile(join(app.dir, seedFile), "utf8");
        try {
          await tx.unsafe(text);
          ran = true;
        } catch (error) {
          throw new Error(
            `apps/${app.slug}: its seed, ${seedFile}, failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }
      await tx.unsafe(`comment on schema "${app.slug}" is null`);
    });
  } finally {
    await sql.end();
  }
  return ran;
}

export interface ProvisionDatabasesOptions {
  /** A superuser URL for the install's database. */
  adminUrl: string;
  /** The install's database secret, which every role's password comes from. */
  secret: string;
  /** The apps that have a database. */
  slugs: readonly string[];
}

/**
 * The provision step in production: gives each app in `slugs` its database,
 * with the password `databasePassword` derives for it, so the `DATABASE_URL`
 * the owner set on the host keeps working. Runs no `migrate` script; each
 * app migrates itself as it starts. Safe to run on every deploy.
 *
 * @returns each app's `DATABASE_URL`, by slug
 */
export async function provisionDatabases({
  adminUrl,
  secret,
  slugs,
}: ProvisionDatabasesOptions): Promise<Map<string, string>> {
  const databaseUrls = new Map<string, string>();
  for (const slug of slugs) {
    const password = databasePassword(secret, slug);
    databaseUrls.set(slug, await provisionDatabase(adminUrl, slug, password));
  }
  return databaseUrls;
}

/**
 * The password of an app's role in production: the HMAC of its slug under
 * the install's database secret. Anyone with the secret can work out every
 * app's password, so only the provision step holds it.
 */
export function databasePassword(secret: string, slug: string): string {
  if (secret.length < 32) {
    throw new Error("The database secret must be at least 32 characters.");
  }
  return createHmac("sha256", secret).update(slug).digest("hex");
}

/** An app's `DATABASE_URL`: the admin URL's database, as the app's role. */
export function databaseUrl(
  adminUrl: string,
  slug: string,
  password: string,
): string {
  const url = new URL(adminUrl);
  url.username = slug;
  url.password = password;
  return url.href;
}

/**
 * Gives an app its own schema and a login role that can touch nothing else,
 * both named after the app's slug. Safe to run on every start: it converges
 * on the same grants and sets the password each time, a fresh one unless
 * given.
 *
 * @param adminUrl a superuser URL for the install's database
 * @returns the app's `DATABASE_URL`
 */
export async function provisionDatabase(
  adminUrl: string,
  slug: string,
  password = randomBytes(24).toString("hex"),
): Promise<string> {
  const problem = slugProblem(slug);
  if (problem) throw new Error(problem);
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
      const [schema] =
        await tx`select 1 from pg_namespace where nspname = ${slug}`;
      await tx.unsafe(
        `create schema if not exists ${role} authorization ${role}`,
      );
      // A new schema waits for its app's seed.
      if (!schema) {
        await tx.unsafe(`comment on schema ${role} is '${seedPending}'`);
      }
      await tx.unsafe(`alter role ${role} set search_path = ${role}`);
      await tx.unsafe(`revoke all on database "${database}" from public`);
      await tx.unsafe(`grant connect on database "${database}" to ${role}`);
      await tx.unsafe(`revoke all on schema public from public`);
    });
  } finally {
    await sql.end();
  }

  return databaseUrl(adminUrl, slug, password);
}
