import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { inject } from "vitest";

function inDatabase(url: string, name: string): string {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.href;
}

/**
 * An empty database in the suite's Postgres with the `notes` app's schema,
 * as the provision step leaves it: owned by the app's role, which has it
 * on its search path, and can create nothing else.
 *
 * @returns the app's `DATABASE_URL` for the new database
 */
export async function freshDatabase(): Promise<string> {
  const name = `notes_${randomBytes(6).toString("hex")}`;
  await asAdmin(inject("adminUrl"), `create database ${name}`);
  await asAdmin(
    inDatabase(inject("adminUrl"), name),
    "create schema notes authorization notes",
  );
  return inDatabase(inject("databaseUrl"), name);
}

/** The superuser's URL for the database `databaseUrl` names. */
export function adminUrlFor(databaseUrl: string): string {
  return inDatabase(inject("adminUrl"), new URL(databaseUrl).pathname.slice(1));
}

/** Runs `statement` as the superuser, in the database `url` names. */
async function asAdmin(url: string, statement: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  await sql.unsafe(statement).finally(() => sql.end());
}

/** Runs `statement` at `url` and returns its rows. */
export async function query<Row extends object>(
  url: string,
  statement: string,
): Promise<Row[]> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    return [...(await sql.unsafe<Row[]>(statement))];
  } finally {
    await sql.end();
  }
}
