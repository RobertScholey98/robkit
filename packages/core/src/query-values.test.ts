import { freePort } from "@internal/test-postgres";
import { DrizzleQueryError, sql } from "drizzle-orm";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { reportToConsole } from "@robkit/input/report";
import { createDatabase } from "./database.ts";
import { withoutQueryValues } from "./query-values.ts";
import { printedLog } from "./test/printed-log.ts";

const secret = "SECRETCODE42";
const query =
  'select "id" from "core"."access_codes" where "access_codes"."code" = $1';

/** A Postgres error as postgres.js makes one, from the fields Postgres sent. */
function postgresError(fields: Record<string, string>): Error {
  const PostgresError = postgres.PostgresError as unknown as new (
    fields: Record<string, string>,
  ) => Error;
  return new PostgresError(fields);
}

/** A broken check on an insert, as Postgres reports it, quoting the row. */
const checkFailed = () =>
  postgresError({
    severity_local: "ERROR",
    severity: "ERROR",
    code: "23514",
    message: `new row for relation "access_codes" violates check constraint "access_codes_code_shape" with ${secret}`,
    detail: `Failing row contains (5f0c, ${secret}, Gran, null, null).`,
    hint: `Try a code other than ${secret}.`,
    where: `SQL statement "insert ... ${secret}"`,
    internal_query: `insert into x values ('${secret}')`,
    schema_name: "core",
    table_name: "access_codes",
    column_name: "code",
    constraint_name: "access_codes_code_shape",
    file: "execMain.c",
    line: "2050",
    routine: "ExecConstraints",
  });

/** What reportToConsole prints of `cause` once core's reporter has it. */
function printed(cause: unknown): string {
  const log = printedLog();
  withoutQueryValues(reportToConsole)("POST /login/code failed.", cause);
  return log();
}

describe("a database error", () => {
  it("prints the query's text with no parameter", () => {
    const text = printed(new DrizzleQueryError(query, [secret]));

    expect(text).toContain(`Failed query: ${query}`);
    expect(text).not.toContain(secret);
  });

  it("prints Postgres's code, severity and names beneath it, and nothing that can quote a value", () => {
    const text = printed(new DrizzleQueryError(query, [secret], checkFailed()));

    expect(text).toContain("code: '23514'");
    expect(text).toContain("severity: 'ERROR'");
    expect(text).toContain("schema_name: 'core'");
    expect(text).toContain("table_name: 'access_codes'");
    expect(text).toContain("column_name: 'code'");
    expect(text).toContain("constraint_name: 'access_codes_code_shape'");
    expect(text).not.toContain(secret);
    expect(text).not.toContain("Failing row");
  });

  it("is told without its values beneath an error of another kind", () => {
    const text = printed(
      new Error("Core couldn't claim the install.", {
        cause: new DrizzleQueryError(query, [secret], checkFailed()),
      }),
    );

    expect(text).toContain("Error: Core couldn't claim the install.");
    expect(text).toContain(`Failed query: ${query}`);
    expect(text).toContain("constraint_name: 'access_codes_code_shape'");
    expect(text).not.toContain(secret);
  });

  it("is told without its values inside an AggregateError", () => {
    const text = printed(
      new AggregateError(
        [
          new Error("The proxy wouldn't stop."),
          new DrizzleQueryError(query, [secret], checkFailed()),
        ],
        "Core couldn't stop.",
      ),
    );

    expect(text).toContain("AggregateError: Core couldn't stop.");
    expect(text).toContain("Error: The proxy wouldn't stop.");
    expect(text).toContain(`Failed query: ${query}`);
    expect(text).not.toContain(secret);
  });

  it("is told without its values in a chain that comes back on itself", () => {
    const outer = new AggregateError([], "Two things failed.");
    outer.errors.push(
      outer,
      new DrizzleQueryError(query, [secret], checkFailed()),
    );

    const text = printed(outer);

    expect(text).toContain(`Failed query: ${query}`);
    expect(text).not.toContain(secret);
  });

  it("is told the same way on its own, not beneath Drizzle's", () => {
    const text = printed(checkFailed());

    expect(text).toContain("constraint_name: 'access_codes_code_shape'");
    expect(text).not.toContain(secret);
  });
});

describe("a driver error beneath a failed query", () => {
  it("keeps a connection error's message, which names only the database's address", async () => {
    const db = createDatabase(
      `postgres://core:x@127.0.0.1:${String(await freePort())}/robkit`,
    );
    const failed = await db
      .execute(sql`select ${secret}`)
      .catch((error: unknown) => error);
    await db.$client.end();

    const text = printed(failed);

    expect(text).toContain("Failed query: select $1");
    expect(text).toMatch(/Error: connect ECONNREFUSED 127\.0\.0\.1:\d+/);
    expect(text).toContain("code: 'ECONNREFUSED'");
    expect(text).not.toContain(secret);
  });

  it("leaves out any other error's message, which can quote a value", () => {
    const text = printed(
      new DrizzleQueryError(
        query,
        [secret],
        Object.assign(new TypeError(`Can't serialize ${secret}.`), {
          code: "ERR_INVALID_ARG_TYPE",
        }),
      ),
    );

    expect(text).toContain("TypeError: The database driver failed.");
    expect(text).toContain("code: 'ERR_INVALID_ARG_TYPE'");
    expect(text).not.toContain(secret);
  });

  it("leaves out the query values postgres.js puts on an error it rejects", () => {
    const driverError = new Error("write CONNECTION_ENDED 127.0.0.1:5432");
    Object.defineProperties(driverError, {
      query: { value: `select '${secret}'`, enumerable: true },
      parameters: { value: [secret], enumerable: true },
      args: { value: [secret], enumerable: true },
      types: { value: [25], enumerable: true },
    });

    const text = printed(
      new Error("Core couldn't sign in.", { cause: driverError }),
    );

    expect(text).toContain("Error: Core couldn't sign in.");
    expect(text).not.toContain(secret);
    expect(text).not.toContain("types: [ 25 ]");
  });
});

describe("an error with no database error in its chain", () => {
  /** What reportToConsole prints of `cause` itself, with no wrapper. */
  function printedWhole(cause: unknown): string {
    const log = printedLog();
    reportToConsole("POST /login/code failed.", cause);
    return log();
  }

  it.each([
    ["a plain error", new Error("Core's key is a shared secret.")],
    [
      "an error with a cause and a field",
      Object.assign(
        new Error("Core couldn't read ROBKIT_APPS.", {
          cause: new SyntaxError("Unexpected token"),
        }),
        { code: "ERR_ROBKIT" },
      ),
    ],
    [
      "an AggregateError",
      new AggregateError(
        [new Error("first"), new TypeError("second")],
        "Two things failed.",
      ),
    ],
    ["a value that isn't an error", "a string"],
  ])("prints %s as it is", (_, cause) => {
    expect(printed(cause)).toBe(printedWhole(cause));
  });

  it("prints no cause when there is none", () => {
    const log = printedLog();

    withoutQueryValues(reportToConsole)("Password checks are full.");

    expect(log()).toBe("Password checks are full.");
  });
});
