import postgres from "postgres";

/**
 * Whether `error` is how Postgres tells a transaction that another one,
 * provisioning at the same moment, got there first. Found by test
 * (`provision.db.test.ts`, "several runs start together"):
 *
 * - `23505` on a system catalog's unique index, such as
 *   `pg_authid_rolname_index` when both create the role, or
 *   `pg_namespace_nspname_index` when both create the schema.
 * - `42710` "role already exists", when the other run committed the role
 *   after this one read `pg_roles` and before it created it.
 * - `XX000` "tuple concurrently updated", when both alter the same role,
 *   or change who may connect to the database, even for two different
 *   apps.
 *
 * The losing transaction has rolled back by then, so trying again is safe.
 */
export function lostRace(error: unknown): boolean {
  if (!(error instanceof postgres.PostgresError)) return false;
  switch (error.code) {
    case "23505":
      return error.constraint_name?.startsWith("pg_") === true;
    case "42710":
      return true;
    case "XX000":
      return error.message === "tuple concurrently updated";
    default:
      return false;
  }
}
