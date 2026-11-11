# 37: A role's password stays out of the statement

**What to build:** Provisioning gives each app's database role its password by writing it into the statement: `create role "notes" … password '…'`, or `alter role` (`packages/provision/src/provision.ts`). Postgres logs a statement that fails, whole, at its default `log_min_error_statement`. Since ticket 12, two cores that start together are expected to collide there and retry, so a lost race puts a role's password in Postgres's own log. The same statement reaches `pg_stat_activity` while it runs, `pg_stat_statements` where that is on, and the log of any host that sets `log_statement` to `ddl`. Opus found this in milestone 2's code round, and milestone 4's ticket round took it.

- **Send a verifier, not the password.** Provisioning works out the role's SCRAM-SHA-256 verifier itself and puts that in the statement. Postgres stores a verifier it is given as it stands. The password is derived as today and never written into any statement.
- **The password still works.** The role signs in with the same derived password as before, on a new role and on one that already exists.
- **No new dependency.** The verifier is PBKDF2 and two HMACs, which `node:crypto` has.
- **The verifier is secret too.** Whoever holds it can't sign in with it, but can try guesses against it offline. The password is derived from the install's secret and is long, so say that in `SECURITY.md` in a sentence, and don't log the verifier anywhere robkit logs.
- **Docs.** `packages/provision/README.md` and `SECURITY.md` say what the statement holds.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] The statement that creates a role, and the one that changes it, hold no password, shown by reading the statements provisioning sends
- [ ] A new role signs in to Postgres with the derived password, and so does a role provisioned before this change and provisioned again
- [ ] A provisioning run that loses the race and retries leaves no password in Postgres's log, shown against a real Postgres
- [ ] The verifier has the form Postgres stores for SCRAM-SHA-256, and a test checks it against one Postgres made from the same password, salt and iteration count
- [ ] A changeset names `@robkit/provision`
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From the ticket round, 2026-11-11

Both reviewers said to take this in milestone 4, and both chose the verifier over the other way [ticket 30](30-error-log-holds-no-parameters.md)'s comments offered, `set local log_min_error_statement` and `log_statement` in the provisioning transaction. Turning the log off needs a superuser, hides only the log, and loses Postgres's own account of a failed statement. The verifier takes the password out of the statement, so it is out of every place the statement goes.

It is a ticket of its own, not a bullet on ticket 30, since it changes `@robkit/provision` and none of core's reporting.
