# 12: Core is one command

**What to build:** `apps/core` in every install holds three source files and this `start` script: `node src/provision.ts && node src/migrate.ts && env -u ROBKIT_ADMIN_DATABASE_URL -u ROBKIT_DB_SECRET node src/main.ts`. It is all platform logic, the owner can break it by editing it, and a fix to it never reaches an existing install, since the templates are copied once.

- **Provisioning gets its own package.** `@robkit/provision`, a new published package, holds what gives each app its schema and role: `provisionDatabases`, `provisionDatabase`, `databasePassword`, `databaseUrl` and `readProvisionConfig`, which move out of `@robkit/dev`. It depends on `@robkit/input` and `postgres` only. Core, the dev runner and create-robkit import it. Core's dev edge to `@robkit/dev` goes, since its tests used it only for this. Finding the apps and running their `migrate` scripts (`provisionApps`) stays in `@robkit/dev`. It has the published-package shape, and its graph entry lands in the same commit as the move.
- **The commands' handler moves below the dev runner.** Every robkit command runs through `runCommand` and throws `CommandProblem`, and both live in `@robkit/dev` (`packages/dev/src/run-command.ts`). `robkit-core` needs them, and so does ticket 09's `robkit-migrate`, but core's image must not hold the dev runner. Move `runCommand`, `CommandProblem` and `reportFaultsAt` to a new `@robkit/input/command` entry, beside `@robkit/input/report`, which is all they import. `@robkit/dev/cli` re-exports them, so its callers don't change. `docs/conventions/errors.md` names the new home.
- **Provisioning returns what went wrong.** Today these functions throw `CommandProblem` (`packages/dev/src/provision.ts`). They are a library's functions, not a command, so a failure the caller can expect comes back as a value, as `docs/conventions/errors.md` says: a slug that won't do, a role it refuses to touch, a secret that is too short. Each command that calls it, in `@robkit/dev`, create-robkit and `robkit-core`, turns that into its own `CommandProblem` at its edge.
- **Provisioning refuses to alter itself.** It refuses a slug that names the role it is connected as, or an existing role with `rolsuper` ([review](../research/review-2026-11-09.md), "Provisioning alters any existing role"). Both come back as values too.
- **The command.** `@robkit/core` ships a `robkit-core` command:
  - `robkit-core start` provisions, migrates core's database, then serves.
  - `robkit-core migrate` migrates core's database.
  - `robkit-core serve` serves, for `pnpm dev`, which has already provisioned and migrated.
- **When `start` provisions.** With `ROBKIT_ADMIN_DATABASE_URL` and `ROBKIT_DB_SECRET` both set, it provisions. With neither set, it skips the step and prints one line that says so. With one set and not the other, it stops with the reader's message: a typo must not skip the step in silence and leave apps without a database.
- **Two cores can start together.** As in a rolling deploy. Three places collide today, and each gets its own fix. None is an advisory lock: every app shares the one database, any role in it can take any advisory key, and the keys would be in robkit's source, so an imported app could hold one and keep core from starting.
  - **Provisioning** reads `pg_roles` and then creates the role, in one transaction for each app. The core that loses a race gets a known error from Postgres, such as a duplicate role or schema, or `tuple concurrently updated`, and its transaction rolls back. It runs that app's transaction again, a few times at most, and then finds the role there. Find the errors by test and name them in the code.
  - **Core's migrator** creates its journal and reads the last migration with no lock. It locks the journal table inside the migrating transaction, as the Go stack's migrator does (`templates/stacks/go/migrate.go`), and tries again if two runs race to create the table. No app's role can touch a table in core's schema. `robkit-core migrate` runs the same migrator, so it has the same lock.
  - **Registering the listed apps** happens later, in the serving process. It checks, inserts the app, then inserts the roles its rule names (`packages/core/src/apps.ts`). Make the app's insert do nothing when another core has just written the row, and make the core that lost add no roles for that app: the row the insert returns says who won.
- **The serving process starts without the secrets.** Its own environment holds no `ROBKIT_ADMIN_DATABASE_URL` or `ROBKIT_DB_SECRET`, as `env -u` arranges today, so nothing core logs or dumps can carry them. Do it by replacing the process once provisioning and migrating are done, if Node 24's `process.execve` is stable enough, or by a child process that `start` passes SIGTERM on to. Say which and why. This guards against core leaking its own environment. It is not a wall: the container was started with the secrets, and code inside it can read them from `/proc`. Say that in the comments and in `SECURITY.md`.
- **The signing key is ready before core listens.** The key `main.ts` loads today and throws away is the one the app uses, so the first sign-ins after a restart don't wait on it inside a transaction ([review](../research/review-2026-11-09.md), "Core").
- **`apps/core` has no source.** It is a `package.json` whose `dev`, `migrate` and `start` scripts run `robkit-core`, with the dependencies core needs. Its `tsconfig.json` and `typecheck` script go too, since there is nothing left to check. Core's image no longer holds `@robkit/dev`.
- **One `dev` script, in every install.** It is `robkit-core serve`. The generator writes nothing special for a linked install: a script that pointed at the checkout would survive `robkit vendor`, which rewrites only the overrides, and a packed install would then run the checkout's source. `serve` decides for itself. When its own file isn't under a `node_modules` folder, which is true only of a checkout that an install links to, it runs under Node's watch mode, so core restarts when its source changes, as today. Anywhere else it runs no watcher. `start` and `migrate` never watch, in a checkout or out of one.
- **A packed install gets every robkit package it needs.** The generator links, and `robkit vendor` packs, only the robkit packages an install's manifests name (`packages/create-robkit/src/generate.ts`, `vendor.ts`). No manifest names `@robkit/provision`: it arrives behind core. Both must cover the packages those names depend on as well, or a packed install asks npm for a package that isn't there. Don't fix it by adding a dependency `apps/core` doesn't use.
- **The stop reaches the server, in every image.** The Dockerfile's `CMD` is shared by every app's image, and it runs `node --run start`, so a shell and a second Node stand between Docker's signal and the server. This ticket makes the signal arrive: change the `CMD`, or how `start` scripts run, so that `docker stop` reaches the app's own process in any image, Go's included. Core handles it here. Ticket 11 makes each stack's server handle it.
  - The server must be the process Docker signals, or the direct child of one that passes the signal on and waits for it. An init that signals the whole process group won't do: the wrapper dies first, the container goes with it, and open requests are cut.
  - Every stack's `start` is `<migrate> && <serve>`, and a shell doesn't replace itself with the last command of an `&&` list. Find out first whether `node --run` passes SIGTERM on to what it runs, and record it.
  - Put no `exec` in a `package.json` script: the Node stacks' `start` scripts run under cmd.exe today, and `exec` would end that. The Dockerfile runs only on Linux, so shell syntax can go there.
- **A stop finishes what it started.** On SIGTERM core stops taking new requests, lets open ones finish, prints one line when it has stopped, and exits with code 0. Prove that in `@robkit/core`'s own tests, with a slow handler and a signal. No route in an install is slow enough to show it from outside. The production test proves that the signal arrived: the container exits with the server's own code, and its log holds the line.
- **An owner can still write their own core.** `createApp`, `createDatabase`, `migrate` and the rest stay exported. `@robkit/core`'s README shows a `main.ts` that uses them, for an owner who needs to change how core starts.

**Blocked by:** 02, 04

**Status:** done

- [x] `apps/core` in a new install holds a `package.json` and no `src`, `tsconfig.json` or `typecheck` script, and the install's `pnpm typecheck` passes
- [x] `robkit-core start` provisions, migrates and serves; a check from outside finds neither secret in the serving process's own environment
- [x] With neither provisioning setting, `start` skips the step and says so; with one of the two, it stops with the reader's message
- [x] In core's own tests, a request open when SIGTERM arrives finishes, and the process then exits
- [x] `docker stop` on core's production image ends the container with exit code 0 before Docker's kill timeout, and its log holds the line core prints when it has stopped
- [x] `docker stop` on a Go app's production image, whose server already handles the signal, ends the container with exit code 0
- [x] No `package.json` script in the templates uses `exec`
- [x] Two cores that start together on an empty database, with the provisioning settings present and apps listed, one of them with roles in its rule, both come up; each role is made once, each migration runs once, each app is registered once and its rule is whole
- [x] While provisioning and core's migrations run, `pg_locks` shows no advisory lock
- [x] `robkit-core` runs through `runCommand` from `@robkit/input/command`, `@robkit/dev/cli` still exports it, and `docs/conventions/errors.md` names the new home
- [x] `pnpm dev` runs core through `robkit-core serve`; a linked install restarts it on a change to core's source; a packed install, and one that was linked and then vendored, run no watcher
- [x] A packed install whose manifests don't name `@robkit/provision` installs and runs with no access to the checkout, and asks npm for no `@robkit` package
- [x] Core's production image holds no `@robkit/dev`
- [x] Provisioning refuses its own role's name and a superuser's, and each command that calls it prints a message that names the slug, with no stack
- [x] `@robkit/provision` has its README, API report, graph entry, changeset and thresholds, and the graph check passes with no cycle
- [x] The README's own-core example compiles under the doc-examples check
- [x] The whole-stack and production tests pass
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### Chosen in the build, awaiting R's review

- **The serving process is a child, not `process.execve`.** `robkit-core start` provisions and migrates, then runs `serving.ts` in a child process whose environment has no `ROBKIT_ADMIN_DATABASE_URL` or `ROBKIT_DB_SECRET`. It passes SIGTERM and SIGINT on and exits with the child's code, or 128 plus the signal's number. `execve` is still experimental in Node 24, isn't on Windows, and would cut off output still on its way to a pipe. This hides the secrets from core's own environment only: code in core's container can still read them from `/proc`. `SECURITY.md` says so under Known gaps.
- **How Docker's signal reaches the server.** I measured first:
  - `node --run` passes no signal on. As PID 1 it ignored SIGTERM until Docker's SIGKILL (exit 137). Outside PID 1 it died with 143 and left the server running. Under `--init` it also died with 143, and the server was killed.
  - Alpine's busybox `sh` does replace itself with the last command of an `a && b` list. The server's parent was `node --run` directly, with no shell between. **This contradicts the ticket's line** "a shell doesn't replace itself with the last command of an `&&` list". It holds for busybox `sh` on Alpine, which the image runs. I didn't check dash.
  - So the Dockerfile's `CMD` reads the app's `start` script and hands it to `/bin/sh -c`. The server, or `robkit-core start` for core, becomes PID 1. `PATH` gains the app's and the root's `node_modules/.bin`, as `node --run` gave them. No `package.json` script holds `exec`, and a create-robkit test enforces that. pnpm's bin shim for `robkit-core` uses `exec` itself, so no shell stays between.
- **The errors that mean a lost race, found by test.**
  - Provisioning (`packages/provision/src/lost-race.ts`): `23505` on any `pg_` catalog index, `42710` "role already exists", and `XX000` "tuple concurrently updated". `42710` showed up only under `check:all`'s load. Each run now reads the database's and the public schema's access first and writes only what is missing, since every app's run shared those two rows. It tries an app up to 10 times.
  - The journal table (`packages/core/src/migrate.ts`, `createJournal`): `42P07`, or `23505` on a `pg_` index (`pg_type_typname_nsp_index`, `pg_class_relname_nsp_index`). CI then met a third, `42710` "type already exists", on this PR's first full run. So the lead changed `createJournal`: it sorts no error codes. When its create is refused it looks in `pg_tables`, and goes on if the table is there. In WSL, 240 migrators in 40 rounds of six met `42710` once before the change and no error after.
- **The signing key's advisory lock is gone too.** `ensureSigningKey` took one, so it now takes `lock table core.signing_keys in exclusive mode`. The ticket named three places; this was a fourth.
- **`start` checks core's own settings before it provisions.** A container missing `ROBKIT_CORE_URL` stops before it touches the database.
- **`robkit vendor` packs with `--filter-prod "<name>..."`**: each linked package and the packages it runs on, not its dev dependencies. The generator gets the same set from each package's `dependencies` (`withDependencies` in `create-robkit/src/robkit-repo.ts`).
- **Core's coverage leaves out the two process entries**, `serving.ts` and `robkit-core-command.ts`. Each just calls a function that is tested in-process. The tests that spawn them can't feed the coverage report.

### For ticket 09

- Core's migrator is `migrate()` in `packages/core/src/migrate.ts`. `createJournal` makes the journal table. When Postgres refuses the create it looks for the table and goes on if another run made it, whatever the error was. Do the same in `@robkit/drizzle`'s migrator: a list of error codes missed one. The Go stack's `migrate.go` has the same race and no answer to it yet. The migrating transaction then takes `lock table core.__drizzle_migrations in exclusive mode`. The test that `pg_locks` shows no advisory lock is in `migrate.db.test.ts`.
- `runCommand` and `CommandProblem` are in `@robkit/input/command`, for `robkit-migrate`.

### For ticket 11

- Core listens and stops in `listenUntilStopped` (`packages/core/src/listen.ts`), called from `serveCore` (`serve-core.ts`). On SIGTERM or SIGINT it closes the server, lets open requests finish, runs `onStopped` (core closes its database), prints `<name> stopped` and resolves 0. If it can't listen, such as a taken port, it runs `onStopped` and rejects. Its doc comment says ticket 11 moves it to `@robkit/serve`.
- In an image, Docker's SIGTERM goes straight to the `start` script's last command, so each stack's server must handle SIGTERM and exit 0 itself. The production test proves it for core and Go (`stopApp` in `tooling/e2e/src/production-checks.ts`). Add a Node stack there once its server handles the signal.

### Proof

- `pnpm check:all` passed in WSL, 65 of 65 tasks, and `check-coverage-ratchet.ts` then named core's functions threshold and dev's four, which are raised.
- On Windows, `pnpm check` failed only the three known `vendor.test.ts` tests.
- Dev's coverage fell under its thresholds once the code it tested moved out, so one runner test now runs `runDev` in-process.
- Core: 448 tests, including two cores on an empty database, the stop with a slow request, and the serving process's environment read from `/proc`. Coverage passes its thresholds.
- `@robkit/provision`: 30 tests at 100% lines, and its race test passed in four suites run at once, twice.
- The production test passed, 16 tests. `docker stop` ended core in about half a second, with code 0 and `core stopped` as its last line. A Go app's container exited 0.
- The whole-stack tests for core, config problems and each install's CI steps passed in WSL, typecheck included.

### Not verified

- I didn't rerun the production test with the old `CMD` to see the stop tests fail. The measurements above are the evidence that `node --run` would fail them.
- No test runs a vendored install's `pnpm dev`. `watches()` is tested on paths, and the restart is tested in this checkout.
