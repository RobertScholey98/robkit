import { createHmac, randomBytes } from "node:crypto";
import postgres from "postgres";
import { isProblem, readSlug, type Slug } from "@robkit/input";

/** The database secret is too short to derive passwords from. */
export interface ShortSecret {
  outcome: "short-secret";
  /** What is wrong, as a sentence. */
  error: string;
}

/**
 * Why the provision step won't give an app its database: its name isn't a
 * slug. `error` says so in a sentence that names it.
 */
export interface RefusedApp {
  outcome: "not-a-slug";
  slug: string;
  error: string;
}

/** What the provision step can refuse to do, as a value its caller expects. */
export type ProvisionRefusal = ShortSecret | RefusedApp;

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
 * app migrates itself as it starts. Safe to run on every deploy. It stops at
 * the first app it refuses, and refuses a short secret before it starts.
 *
 * @returns each app's `DATABASE_URL`, by slug, or what it refused
 */
export async function provisionDatabases({
  adminUrl,
  secret,
  slugs,
}: ProvisionDatabasesOptions): Promise<
  { outcome: "provisioned"; databaseUrls: Map<Slug, string> } | ProvisionRefusal
> {
  const passwords = new Map<Slug, string>();
  for (const slug of slugs) {
    const derived = databasePassword(secret, slug);
    if (derived.outcome !== "derived") return derived;
    passwords.set(slug, derived.password);
  }
  const databaseUrls = new Map<Slug, string>();
  for (const [slug, password] of passwords) {
    const result = await provisionDatabase(adminUrl, slug, password);
    if (result.outcome !== "provisioned") return result;
    databaseUrls.set(slug, result.databaseUrl);
  }
  return { outcome: "provisioned", databaseUrls };
}

/** The shortest database secret the step derives passwords from. */
const shortestSecret = 32;

/**
 * The password of an app's role in production: the HMAC of its slug under
 * the install's database secret. Anyone with the secret can work out every
 * app's password, so only the provision step holds it.
 */
export function databasePassword(
  secret: string,
  slug: Slug,
): { outcome: "derived"; password: string } | ShortSecret {
  if (secret.length < shortestSecret) {
    return {
      outcome: "short-secret",
      error: `The database secret is ${String(secret.length)} characters. It must be at least ${String(shortestSecret)}.`,
    };
  }
  const password = createHmac("sha256", secret).update(slug).digest("hex");
  return { outcome: "derived", password };
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
 * given. It refuses a name that isn't a slug.
 *
 * @param adminUrl a superuser URL for the install's database
 * @returns the app's `DATABASE_URL`, or why it refused
 */
export async function provisionDatabase(
  adminUrl: string,
  slug: Slug,
  password = randomBytes(24).toString("hex"),
): Promise<{ outcome: "provisioned"; databaseUrl: string } | RefusedApp> {
  // The slug goes into DDL, so a caller in plain JavaScript is checked too.
  const read = readSlug(slug);
  if (isProblem(read)) {
    return { outcome: "not-a-slug", slug, error: read.error };
  }
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

  return {
    outcome: "provisioned",
    databaseUrl: databaseUrl(adminUrl, slug, password),
  };
}
