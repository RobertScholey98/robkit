import { randomBytes } from "node:crypto";
import postgres from "postgres";

const reserved = new Set(["public", "postgres"]);

/**
 * Slugs become unquoted-looking identifiers so app code can write `notes.note`
 * without quoting, and so they can be inlined into DDL safely.
 */
function assertSafeSlug(slug: string): void {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(slug) ||
    slug.startsWith("pg_") ||
    reserved.has(slug)
  ) {
    throw new Error(
      `"${slug}" can't be a database role. Use lowercase letters, digits and underscores, start with a letter, and avoid public, postgres and pg_ names.`,
    );
  }
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
  assertSafeSlug(slug);
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
