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

**Status:** ready-for-agent

- [ ] A database fault during `/login/code` logs the failed query's text and the SQLSTATE code, and the typed code appears nowhere in what `reportToConsole` prints, stack and causes included
- [ ] The same holds for a fault during `POST /codes`, for the new code, and during `/setup`, for the password hash
- [ ] A real constraint failure from Postgres, whose `detail` holds the row, logs the constraint's name and none of the row
- [ ] A database error beneath an error of another kind, and one inside an `AggregateError`, is scrubbed the same way
- [ ] A fault reported through a route's `logError`, and one at core's start-up, gets the same treatment, with a test for each
- [ ] An error with no database error in its chain is logged as it is today
- [ ] The PR's CI `gate` job passes on GitHub

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
