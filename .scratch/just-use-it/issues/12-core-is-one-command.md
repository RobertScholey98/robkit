# 12: Core is one command

**What to build:** `apps/core` in every install holds three source files and this `start` script: `node src/provision.ts && node src/migrate.ts && env -u ROBKIT_ADMIN_DATABASE_URL -u ROBKIT_DB_SECRET node src/main.ts`. It is all platform logic, the owner can break it by editing it, and a fix to it never reaches an existing install, since the templates are copied once.

- **Provisioning gets its own package.** `@robkit/provision`, a new published package, holds what gives each app its schema and role: `provisionDatabases`, `databasePassword`, `databaseUrl` and `readProvisionConfig`, which move out of `@robkit/dev`. It depends on `@robkit/input` and `postgres` only. Core, the dev runner and create-robkit import it. Core's dev edge to `@robkit/dev` goes, since its tests used it only for this. Finding the apps and running their `migrate` scripts (`provisionApps`) stays in `@robkit/dev`. It has the published-package shape, and its graph entry lands in the same commit as the move.
- **Provisioning refuses to alter itself.** It refuses a slug that names the role it is connected as, or an existing role with `rolsuper` ([review](../research/review-2026-11-09.md), "Provisioning alters any existing role").
- **The command.** `@robkit/core` ships a `robkit-core` command:
  - `robkit-core start` runs the provision step when its settings are present, migrates core's database, then serves.
  - `robkit-core migrate` migrates core's database.
  - `robkit-core serve` serves, for `pnpm dev`, which has already provisioned and migrated.
- **The serving process starts without the secrets.** Its own environment holds no `ROBKIT_ADMIN_DATABASE_URL` or `ROBKIT_DB_SECRET`, as `env -u` arranges today, so nothing core logs or dumps can carry them. Do it by replacing the process once provisioning and migrating are done, if Node 24's `process.execve` is stable enough, or by a child process that `start` passes SIGTERM on to. Say which and why. This guards against core leaking its own environment. It is not a wall: the container was started with the secrets, and code inside it can read them from `/proc`. Say that in the comments and in `SECURITY.md`.
- **Core's migrations take a lock.** Core's migrator creates its journal and reads the last migration with no lock, so two cores starting together, as in a rolling deploy, can both migrate. It takes an advisory lock first, as ticket 09 does for apps.
- **The signing key is ready before core listens.** The key `main.ts` loads today and throws away is the one the app uses, so the first sign-ins after a restart don't wait on it inside a transaction ([review](../research/review-2026-11-09.md), "Core").
- **`apps/core` has no source.** It is a `package.json` whose `dev`, `migrate` and `start` scripts run `robkit-core`, with the dependencies core needs. Its `tsconfig.json` and `typecheck` script go too, since there is nothing left to check. Core's image no longer holds `@robkit/dev`.
- **A linked install still reloads core.** The published command runs no watcher. For an install made with `--link`, the generator writes a `dev` script that runs Node's watch mode on the checkout's own command file, so core restarts when its source changes, as today.
- **The stop has to work in the image.** `docker stop` reaches the server through whatever the image's `CMD` and core's `start` put between them. Prove it in the production test.
- **An owner can still write their own core.** `createApp`, `createDatabase`, `migrate` and the rest stay exported. `@robkit/core`'s README shows a `main.ts` that uses them, for an owner who needs to change how core starts.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `apps/core` in a new install holds a `package.json` and no `src`, `tsconfig.json` or `typecheck` script, and the install's `pnpm typecheck` passes
- [ ] `robkit-core start` provisions, migrates and serves; a check from outside finds neither secret in the serving process's own environment
- [ ] `docker stop` on core's production image ends the container before Docker's kill timeout, and a request open at the time finishes
- [ ] Two cores that start together on an empty database both come up, and each migration runs once
- [ ] `pnpm dev` runs core through `robkit-core serve`; a linked install restarts it on a change to core's source, and a packed one runs no watcher
- [ ] Core's production image holds no `@robkit/dev`
- [ ] Provisioning refuses its own role's name and a superuser's, with a message that names the slug
- [ ] `@robkit/provision` has its README, API report, graph entry, changeset and thresholds, and the graph check passes with no cycle
- [ ] The README's own-core example compiles under the doc-examples check
- [ ] The whole-stack and production tests pass
- [ ] The PR's CI `gate` job passes on GitHub
