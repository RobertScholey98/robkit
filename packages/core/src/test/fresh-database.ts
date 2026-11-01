import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { inject } from "vitest";

function inDatabase(url: string, name: string): string {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.href;
}

/**
 * Creates an empty database with core's schema in the suite's Postgres. An
 * install has one owner, so each test that claims one needs its own database.
 *
 * @returns core's `DATABASE_URL` for the new database
 */
export async function freshDatabase(): Promise<string> {
  const name = `core_${randomBytes(6).toString("hex")}`;
  const options = { max: 1, onnotice: () => undefined };

  const admin = postgres(inject("adminUrl"), options);
  await admin.unsafe(`create database ${name}`).finally(() => admin.end());

  const inside = postgres(inDatabase(inject("adminUrl"), name), options);
  await inside
    .unsafe("create schema core authorization core")
    .finally(() => inside.end());

  return inDatabase(inject("databaseUrl"), name);
}
