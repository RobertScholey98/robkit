import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { lostRace } from "./lost-race.ts";

/** An error as Postgres sends it, with the fields `lostRace` reads. */
function fromPostgres(fields: {
  code: string;
  message: string;
  constraint_name?: string;
}): postgres.PostgresError {
  return new postgres.PostgresError(fields as unknown as string);
}

// provision.db.test.ts races six runs, but which of these errors a race
// raises depends on timing, so each one is pinned here.
describe("lostRace", () => {
  it.each([
    [
      "both created the role",
      fromPostgres({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        constraint_name: "pg_authid_rolname_index",
      }),
    ],
    [
      "the other committed the role first",
      fromPostgres({ code: "42710", message: 'role "notes" already exists' }),
    ],
    [
      "both changed the same role",
      fromPostgres({ code: "XX000", message: "tuple concurrently updated" }),
    ],
  ])("is true when %s", (_, error) => {
    expect(lostRace(error)).toBe(true);
  });

  it.each([
    [
      "a unique index of an app's own table",
      fromPostgres({
        code: "23505",
        message: "duplicate key value violates unique constraint",
        constraint_name: "notes_pkey",
      }),
    ],
    [
      "another internal error",
      fromPostgres({ code: "XX000", message: "cache lookup failed" }),
    ],
    [
      "a refused password",
      fromPostgres({
        code: "28P01",
        message: "password authentication failed",
      }),
    ],
    ["an error that isn't from Postgres", new Error("connect ECONNREFUSED")],
  ])("is false for %s", (_, error) => {
    expect(lostRace(error)).toBe(false);
  });
});
