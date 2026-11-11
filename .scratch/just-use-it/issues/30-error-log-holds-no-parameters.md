# 30: Core's error log holds no query parameters

**What to build:** Core logs an unexpected error whole (`packages/core/src/app.ts`, `onError`). Drizzle's `DrizzleQueryError` carries the failed query and its parameters, as a CI log shows ([run 42691533886](https://github.com/RobertScholey98/robkit/actions/runs/42691533886): `throw new DrizzleQueryError(queryString, params, e)`). So a database fault during `/login/code`, `POST /codes` or `/setup` writes the code someone typed, a new code, or the owner's password hash into core's log, which on a host is kept and often shipped elsewhere.

The values are in more places than the error's `params`:

- Drizzle writes them into the error's message, and so into its stack: `Failed query: … params: …`.
- postgres.js copies Postgres's own fields onto the error beneath it. `detail` for a broken check or a null reads "Failing row contains (…)", with every column. Some messages quote a value too, as in `invalid input syntax for type uuid: "…"`.

So dropping `params` and printing the rest still logs the values.

- **Core reports a safe account of a database error, never the error itself.** It keeps the SQL text, which has placeholders, and from Postgres the SQLSTATE code, the severity, and the names of the schema, table, column and constraint. It drops the parameters, the driver's arguments, and Postgres's message, detail, hint, where and internal query. The request id, method and path stay as today.
- **Through the whole chain.** A database error is found and scrubbed wherever it sits: as the error, as a cause beneath an error of another kind, or inside an `AggregateError`.
- **One reporter, wrapped once.** Core reports from `onError`, from the `logError` its routes are handed (`routes/status.ts` uses it), and from start-up, where `robkit-core` runs under `runCommand`'s own reporter. Wrap the reporter once, where core is put together, and hand that one to all three. A failed first insert in `ensureSigningKey` would otherwise print the new private key at start-up.
- **Other errors don't change.** An error with no database error in its chain is reported as today.
- **The answer to the caller doesn't change.** It is already generic, with a request id.
- **Docs.** `docs/conventions/errors.md` says what core logs of a database error, and `SECURITY.md` says core's log holds no query parameters.

A role's password in Postgres's own log is [ticket 37](37-a-roles-password-stays-out-of-the-statement.md).

**Blocked by:** none

**Status:** done

- [x] A database fault during `/login/code` logs the failed query's text and the SQLSTATE code, and the typed code appears nowhere in what `reportToConsole` prints, stack and causes included
- [x] The same holds for a fault during `POST /codes`, for the new code, and during `/setup`, for the password hash
- [x] A real constraint failure from Postgres, whose `detail` holds the row, logs the constraint's name and none of the row
- [x] A database error beneath an error of another kind, and one inside an `AggregateError`, is scrubbed the same way
- [x] A fault reported through a route's `logError`, and one at core's start-up, gets the same treatment, with a test for each
- [x] An error with no database error in its chain is logged as it is today
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2's code round, added by the lead

Opus found a second log that can hold a secret. Postgres logs a statement that fails, whole, at its default `log_min_error_statement`. Provisioning writes each role's password into its `create role` or `alter role` statement, and since ticket 12 two cores that start together are expected to collide and retry. So a lost race puts `create role "notes" … password '…'` in Postgres's own log. The statement predates milestone 2; the expected race is new.

Milestone 4's ticket round should decide whether this ticket takes it. Two ways to close it: `set local log_min_error_statement = 'panic'` and `set local log_statement = 'none'` in the provisioning transaction, which a superuser may set, or send the password as a SCRAM verifier, so the log never holds the password itself.

### From milestone 3, added by the lead

Milestone 3 changed nothing under this ticket. One related message did change: when a migration fails in a running `pnpm dev`, `robkit migrate` now answers that its output is in `pnpm dev`'s terminal. A failed migration prints the failed statement there, as it always has. That is the owner's own terminal in dev, and outside this ticket.

### From the ticket round, 2026-11-11

Taken:

- Both: the parameters are in `DrizzleQueryError`'s message as well as its `params` (drizzle-orm's `errors.js`), and postgres.js copies Postgres's `detail` onto the error beneath it. "Keeps the underlying Postgres error" would have logged the row.
- Sol: "one place" has to include the `logError` that routes are handed. `routes/status.ts` reports through it.
- Opus: core's start-up reports through `runCommand`'s default reporter (`robkit-core-command.ts`), and `ensureSigningKey` inserts the private key as a parameter.
- Sol: `POST /codes` is in the problem and had no criterion.
- Both, on the question above: take the role's password too, and by a SCRAM verifier, not by turning statement logging off. It is [ticket 37](37-a-roles-password-stays-out-of-the-statement.md), a PR of its own, since it changes `@robkit/provision` and nothing here.

Order: this merges before tickets 24 and 28, which edit `packages/core`'s coverage thresholds too.

### From the build, 2026-11-11

Chosen in the build:

- The wrapper is `withoutQueryValues` in `packages/core/src/query-values.ts`. `createApp` wraps its `logError` once and hands that to `onError` and every route, so every caller of `createApp`, tests included, gets it. Core's two process entries, `robkit-core-command.ts` and `serving.ts`, hand `runCommand` the same wrapper for a fault at start-up. `@robkit/input` doesn't change: `runCommand` already takes a reporter.
- A failed query is logged as a `QueryError` whose message is its SQL. Its stack keeps the frames of Drizzle's error, without the header that holds the parameters. Postgres's error becomes a `PostgresError` with `code`, `severity`, `schema_name`, `table_name`, `column_name` and `constraint_name`, the names postgres.js gives them.
- The error directly beneath a failed query, or one postgres.js marked with a query's parameters, is the driver's. It loses postgres.js's `query`, `parameters`, `args` and `types`, and keeps its message only if it is a Node system error, such as `connect ECONNREFUSED 127.0.0.1:5432`, which names an address and no value. Any other driver error's message is left out, since one such as Node's `ERR_INVALID_ARG_TYPE` can quote a value.
- Every other error in the chain is reported as a copy that prints as the original did, with its cause and an `AggregateError`'s errors walked the same way. A chain that comes back on itself ends.
- Not covered: an error whose own message copies a database error's message into its text. Core does nothing like it, and `errors.md` says to pass the error as `cause`.

The tests read what `console.error` prints, stack and causes included. `error-log.db.test.ts` breaks core's own tables so Postgres fails each of `/login/code` (a type change, so Postgres's message quotes the code), `POST /codes` and `/setup` (a `check (false) not valid` constraint, so `detail` holds the row). `error-log.test.ts` covers `/status`'s `logError`, and `robkit-core.db.test.ts` spawns `robkit-core start` on a database whose `signing_keys` refuses the insert. Each fails without the wrapper.

### For the docs site

An owner reading core's log after a database fault sees `QueryError: Failed query: <SQL>`, then "Core leaves its parameters out of the log.", and beneath it `PostgresError: Postgres refused a query with <SQLSTATE>.` with the code, severity and names. Before, it showed `DrizzleQueryError` with `params:` and Postgres's own message and detail. The same holds for a fault at core's start-up, printed under "robkit hit a bug". Nothing a guest sees changes, and no command or file in an install changes.

### Merged

Added by the lead. PR 107 merged into `m4-nothing-skipped` on 2026-11-11, with `gate` green on `84caac5`. The build got no clean full gate on its own machine, which was too busy for other packages' time limits, so GitHub's run was the full gate.
