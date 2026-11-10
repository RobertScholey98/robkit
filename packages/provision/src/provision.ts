import { createHmac, randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import postgres from "postgres";
import { isProblem, readSlug, type Slug } from "@robkit/input";
import { lostRace } from "./lost-race.ts";

/** The database secret is too short to derive passwords from. */
export interface ShortSecret {
  outcome: "short-secret";
  /** What is wrong, as a sentence. */
  error: string;
}

/**
 * Why the provision step won't give an app its database: its name isn't a
 * slug, or it names a role the step won't touch, either the one it
 * connects as or a superuser. `error` says so in a sentence that names it.
 */
export interface RefusedApp {
  outcome: "not-a-slug" | "own-role" | "superuser";
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
 * given. It refuses a name that isn't a slug, the role it connects as, and
 * any superuser, and changes nothing then.
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
  const sql = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const refusal = await sql.begin((tx) =>
          provisionInOne(tx, slug, password),
        );
        if (refusal) return refusal;
        break;
      } catch (error) {
        if (!lostRace(error) || attempt === raceAttempts) {
          throw new Error(
            `The provision step couldn't give ${slug} its database (attempt ${String(attempt)} of ${String(raceAttempts)}).`,
            { cause: error },
          );
        }
        // Another run holds the same rows. Let it finish, then look again.
        await setTimeout(10 + Math.random() * 40 * attempt);
      }
    }
  } finally {
    await sql.end();
  }

  return {
    outcome: "provisioned",
    databaseUrl: databaseUrl(adminUrl, slug, password),
  };
}

/**
 * How many times the step tries one app before it gives up. Each lost race
 * means another run just made what this one was making, so the next try
 * finds it there.
 */
const raceAttempts = 10;

/**
 * One try at an app's role and schema, in one transaction: the check of
 * `pg_roles` and what it decides go together, so a race shows up as an
 * error rather than a role made twice.
 *
 * @returns why it refused, or `undefined` once it is done
 */
async function provisionInOne(
  tx: postgres.TransactionSql,
  slug: Slug,
  password: string,
): Promise<RefusedApp | undefined> {
  const role = `"${slug}"`;
  const [self] = await tx<{ name: string }[]>`select current_user as name`;
  if (self?.name === slug) {
    return {
      outcome: "own-role" as const,
      slug,
      error: `"${slug}" is the role the provision step connects as, so it can't also be an app's role.`,
    };
  }
  const [existing] = await tx<{ superuser: boolean }[]>`
      select rolsuper as superuser from pg_roles where rolname = ${slug}`;
  if (existing?.superuser) {
    return {
      outcome: "superuser" as const,
      slug,
      error: `"${slug}" is a superuser in the install's database, so the provision step won't make it an app's role.`,
    };
  }
  const verb = existing ? "alter" : "create";
  await tx.unsafe(
    `${verb} role ${role} with login nosuperuser nocreatedb nocreaterole password '${password}'`,
  );
  const [{ database } = { database: "" }] = await tx<
    { database: string }[]
  >`select current_database() as database`;
  await tx.unsafe(`create schema if not exists ${role} authorization ${role}`);
  await tx.unsafe(`alter role ${role} set search_path = ${role}`);
  // Each of these rewrites one row that every app's run shares, the
  // database's or the public schema's, so two runs that both write it
  // collide. Each is written only while it still needs it: after the
  // first run, the rest only read.
  const [access] = await tx<
    { databaseOpen: boolean; publicOpen: boolean; canConnect: boolean }[]
  >`
    select
      exists (
        select from pg_database d,
          aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
        where d.datname = current_database() and a.grantee = 0
      ) as "databaseOpen",
      exists (
        select from pg_namespace n,
          aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
        where n.nspname = 'public' and a.grantee = 0
      ) as "publicOpen",
      exists (
        select from pg_database d,
          aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
        where d.datname = current_database()
          and a.grantee = ${slug}::regrole and a.privilege_type = 'CONNECT'
      ) as "canConnect"`;
  if (access?.databaseOpen !== false) {
    await tx.unsafe(`revoke all on database "${database}" from public`);
  }
  if (access?.canConnect !== true) {
    await tx.unsafe(`grant connect on database "${database}" to ${role}`);
  }
  if (access?.publicOpen !== false) {
    await tx.unsafe(`revoke all on schema public from public`);
  }
  return undefined;
}
