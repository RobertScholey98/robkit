import { createHmac, randomBytes } from "node:crypto";
import postgres from "postgres";
import { CommandProblem } from "@robkit/input/command";
import { isProblem, readSlug, type Slug } from "@robkit/input";

export interface ProvisionDatabasesOptions {
  /** A superuser URL for the install's database. */
  adminUrl: string;
  /** The install's database secret, which every role's password comes from. */
  secret: string;
  /** The apps that have a database. */
  slugs: readonly Slug[];
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
}: ProvisionDatabasesOptions): Promise<Map<Slug, string>> {
  const databaseUrls = new Map<Slug, string>();
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
export function databasePassword(secret: string, slug: Slug): string {
  if (secret.length < 32) {
    throw new CommandProblem(
      "The database secret must be at least 32 characters.",
    );
  }
  return createHmac("sha256", secret).update(slug).digest("hex");
}

/** An app's `DATABASE_URL`: the admin URL's database, as the app's role. */
export function databaseUrl(
  adminUrl: string,
  slug: Slug,
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
  slug: Slug,
  password = randomBytes(24).toString("hex"),
): Promise<string> {
  // The slug goes into DDL, so a caller in plain JavaScript is checked too.
  const read = readSlug(slug);
  if (isProblem(read)) throw new CommandProblem(read.error);
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

  return databaseUrl(adminUrl, slug, password);
}
