# 30: Core's error log holds no query parameters

**What to build:** Core logs an unexpected error whole (`packages/core/src/app.ts`, `onError`). Drizzle's `DrizzleQueryError` carries the failed query and its parameters, as a CI log shows ([run 42691533886](https://github.com/RobertScholey98/robkit/actions/runs/42691533886): `throw new DrizzleQueryError(queryString, params, e)`). So a database fault during `/login/code`, `POST /codes` or `/setup` writes the code someone typed, a new code, or the owner's password hash into core's log, which on a host is kept and often shipped elsewhere.

- **Core logs the query and the cause, not the parameters.** Where an error in the chain is Drizzle's, core's report keeps the SQL text, which has placeholders, and the underlying Postgres error, and drops the parameter values. The request id, method and path stay as today.
- **One place.** The scrub sits where core reports the error, so every route gets it, and so does anything else in core that reports through the same function.
- **The answer to the caller doesn't change.** It is already generic, with a request id.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] A database fault during `/login/code` logs the failed query's text and the Postgres error, and the typed code appears nowhere in the log
- [ ] The same holds for a fault during `/setup`, for the password hash
- [ ] An error that isn't Drizzle's is logged as it is today
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2's code round, added by the lead

Opus found a second log that can hold a secret. Postgres logs a statement that fails, whole, at its default `log_min_error_statement`. Provisioning writes each role's password into its `create role` or `alter role` statement, and since ticket 12 two cores that start together are expected to collide and retry. So a lost race puts `create role "notes" … password '…'` in Postgres's own log. The statement predates milestone 2; the expected race is new.

Milestone 4's ticket round should decide whether this ticket takes it. Two ways to close it: `set local log_min_error_statement = 'panic'` and `set local log_statement = 'none'` in the provisioning transaction, which a superuser may set, or send the password as a SCRAM verifier, so the log never holds the password itself.
