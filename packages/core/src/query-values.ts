import { DrizzleQueryError } from "drizzle-orm";
import postgres from "postgres";
import type { Report } from "@robkit/input/report";

/** Each error the walk has met, and what core reports in its place. */
type Seen = Map<Error, unknown>;

/**
 * The stack frames of `error`, without the header that repeats its
 * message, which for a database error can quote a value.
 */
function framesOf(error: Error): string {
  const stack = error.stack ?? "";
  const at = stack.indexOf(error.message);
  if (at === -1) return "";
  return stack
    .slice(at + error.message.length)
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .map((line) => `\n${line}`)
    .join("");
}

/** A failed query as core logs it: its SQL, which holds placeholders. */
class QueryError extends Error {
  override name = "QueryError";

  constructor(failed: DrizzleQueryError) {
    super(
      `Failed query: ${failed.query}\nCore leaves its parameters out of the log.`,
    );
    this.stack = `${this.name}: ${this.message}${framesOf(failed)}`;
  }
}

/**
 * The fields of a Postgres error that name no value. Its message, detail,
 * hint, where and internal query can each quote one.
 */
const namingFields = [
  "code",
  "severity",
  "schema_name",
  "table_name",
  "column_name",
  "constraint_name",
] as const;

/** A Postgres error as core logs it: its SQLSTATE, severity and names. */
class PostgresError extends Error {
  override name = "PostgresError";

  constructor(refused: InstanceType<typeof postgres.PostgresError>) {
    super(
      `Postgres refused a query with ${refused.code}. Core leaves its message and detail out of the log, since they can quote a value.`,
    );
    for (const field of namingFields) {
      const value = refused[field];
      if (value !== undefined) Object.assign(this, { [field]: value });
    }
    this.stack = `${this.name}: ${this.message}${framesOf(refused)}`;
  }
}

/** postgres.js's fields on an error from a query, which hold its values. */
const driverFields = new Set<PropertyKey>([
  "query",
  "parameters",
  "args",
  "types",
]);

/** Whether postgres.js marked `error` as the failure of a query. */
function markedByDriver(error: Error): boolean {
  return Object.hasOwn(error, "parameters");
}

/**
 * Whether `error` is one of Node's system errors, such as a refused
 * connection, whose message names a call and an address, never a value.
 */
function isSystemError(error: Error): boolean {
  return "syscall" in error && typeof error.syscall === "string";
}

const driverMessage =
  "The database driver failed. Core leaves its message out of the log, since it can quote a value.";

/**
 * A copy of `error` that prints as it does, with its cause, and an
 * AggregateError's errors, told without values. A `driver` error, the one
 * beneath a failed query, also loses postgres.js's fields, and its message
 * unless it is a system error. The copy goes in `seen` before its chain, so a
 * chain that comes back to it ends there.
 */
function copyOf(error: Error, seen: Seen, driver: boolean): Error {
  const copy =
    error instanceof AggregateError ? new AggregateError([]) : new Error();
  Object.setPrototypeOf(copy, Reflect.getPrototypeOf(error));
  for (const key of Reflect.ownKeys(error)) {
    const field = Object.getOwnPropertyDescriptor(error, key);
    if (field && !(driver && driverFields.has(key))) {
      Object.defineProperty(copy, key, field);
    }
  }
  // V8's stack is an accessor that reads the error it is called on, so
  // the copy takes the original's as a value.
  Object.defineProperty(copy, "stack", { value: error.stack });
  if (driver && !isSystemError(error)) {
    Object.defineProperty(copy, "message", { value: driverMessage });
    Object.defineProperty(copy, "stack", {
      value: `${error.name}: ${driverMessage}${framesOf(error)}`,
    });
  }
  seen.set(error, copy);
  if ("cause" in error) {
    Object.defineProperty(copy, "cause", {
      value: withoutValues(error.cause, seen),
    });
  }
  if (error instanceof AggregateError) {
    Object.defineProperty(copy, "errors", {
      value: error.errors.map((part: unknown) => withoutValues(part, seen)),
    });
  }
  return copy;
}

/**
 * `error`, with every database error in its chain told without the
 * values of its query, and everything else as it is. A `driver` error is
 * the one directly beneath a failed query.
 */
function withoutValues(error: unknown, seen: Seen, driver = false): unknown {
  if (!(error instanceof Error)) return error;
  if (seen.has(error)) return seen.get(error);
  if (error instanceof DrizzleQueryError) {
    const account = new QueryError(error);
    seen.set(error, account);
    if (error.cause !== undefined) {
      Object.defineProperty(account, "cause", {
        value: withoutValues(error.cause, seen, true),
        writable: true,
        configurable: true,
      });
    }
    return account;
  }
  if (error instanceof postgres.PostgresError) {
    const account = new PostgresError(error);
    seen.set(error, account);
    return account;
  }
  if (driver || markedByDriver(error)) return copyOf(error, seen, true);
  if ("cause" in error || error instanceof AggregateError) {
    return copyOf(error, seen, false);
  }
  return error;
}

/**
 * Wraps `report` so that a database error, wherever it sits in a cause's
 * chain, is reported without the values of its query.
 */
export function withoutQueryValues(report: Report): Report {
  return (message, cause) => {
    report(message, withoutValues(cause, new Map()));
  };
}
