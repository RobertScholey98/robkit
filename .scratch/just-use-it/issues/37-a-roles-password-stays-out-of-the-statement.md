# 37: A role's password stays out of the statement

**What to build:** Provisioning gives each app's database role its password by writing it into the statement: `create role "notes" … password '…'`, or `alter role` (`packages/provision/src/provision.ts`). Postgres logs a statement that fails, whole, at its default `log_min_error_statement`. Since ticket 12, two cores that start together are expected to collide there and retry, so a lost race puts a role's password in Postgres's own log. The same statement reaches `pg_stat_activity` while it runs, `pg_stat_statements` where that is on, and the log of any host that sets `log_statement` to `ddl`. Opus found this in milestone 2's code round, and milestone 4's ticket round took it.

- **Send a verifier, not the password.** Provisioning works out the role's SCRAM-SHA-256 verifier itself and puts that in the statement. Postgres stores a verifier it is given as it stands. The password is derived as today and never written into any statement.
- **The password still works.** The role signs in with the same derived password as before, on a new role and on one that already exists.
- **No new dependency.** The verifier is PBKDF2 and two HMACs, which `node:crypto` has.
- **The verifier is secret too.** Whoever holds it can't sign in with it, but can try guesses against it offline. The password is derived from the install's secret and is long, so say that in `SECURITY.md` in a sentence, and don't log the verifier anywhere robkit logs.
- **Docs.** `packages/provision/README.md` and `SECURITY.md` say what the statement holds.

**Blocked by:** 12

**Status:** done

- [x] The statement that creates a role, and the one that changes it, hold no password, shown by reading the statements provisioning sends
- [x] A new role signs in to Postgres with the derived password, and so does a role provisioned before this change and provisioned again
- [x] A provisioning run that loses the race and retries leaves no password in Postgres's log, shown against a real Postgres
- [x] The verifier has the form Postgres stores for SCRAM-SHA-256, and a test checks it against one Postgres made from the same password, salt and iteration count
- [x] A changeset names `@robkit/provision`
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### From the ticket round, 2026-11-11

Both reviewers said to take this in milestone 4, and both chose the verifier over the other way [ticket 30](30-error-log-holds-no-parameters.md)'s comments offered, `set local log_min_error_statement` and `log_statement` in the provisioning transaction. Turning the log off needs a superuser, hides only the log, and loses Postgres's own account of a failed statement. The verifier takes the password out of the statement, so it is out of every place the statement goes.

It is a ticket of its own, not a bullet on ticket 30, since it changes `@robkit/provision` and none of core's reporting.

### Chosen in the build, 2026-11-11

- The verifier is `scramVerifier(password, salt, iterations)` in `packages/provision/src/scram.ts`. The package doesn't export it.
- Each run salts with a fresh 16 bytes over 4096 iterations, Postgres's default `scram_iterations`. Provisioning sets the password on every run already, so a fresh salt changes nothing an app sees.
- It doesn't run SASLprep over the password, as Postgres does. The two agree on every ASCII password, and robkit's passwords are hex. A caller of `provisionDatabase` who passes a password that SASLprep changes, such as one with a non-ASCII space, gets a role that postgres.js signs in to and libpq might not.
- `literal()` is gone. The verifier is base64, so it needs no escaping.
- The tests read the statements from the test Postgres's own log. The first gives provisioning a superuser with `log_statement = 'ddl'`. The race test makes the role in another transaction and commits it once provisioning waits on it, so the create fails and Postgres logs it after `STATEMENT:`. Each test checks the logged verifier is the password's, and that the log doesn't hold the password.
- robkit logs no verifier. postgres.js puts the statement on its error as a `query` property that isn't enumerable unless `debug` is set, so a thrown provisioning error doesn't print it.

### For the docs site

Nothing an owner, a guest or an app's author sees changes. Each app's `DATABASE_URL` and password are as before. Postgres's own log, and `pg_stat_activity`, now show a role's SCRAM-SHA-256 verifier where they showed its password.

### Merged

Added by the lead. PR 106 merged into `m4-nothing-skipped` on 2026-11-11, with `gate` green on `8279eae`. The whole-stack tests failed on the build's own machine, which was too busy for their time limits, and passed in GitHub's run, where every app signs in with a role provisioned this way.

After the merge the lead added a paragraph to `packages/provision/README.md`: the package doesn't run SASLprep, so `provisionDatabase` wants an ASCII password.

The three polls in `provision.db.test.ts` wait one second, Vitest's default, for a lock or a log line. [Ticket 25](25-ci-checks-without-holes.md) gives every poll in the repo a longer default.
