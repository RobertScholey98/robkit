# 11: Core is one command

**What to build:** `apps/core` in every install holds three source files and this `start` script: `node src/provision.ts && node src/migrate.ts && env -u ROBKIT_ADMIN_DATABASE_URL -u ROBKIT_DB_SECRET node src/main.ts`. It is all platform logic, the owner can break it by editing it, and a fix to it never reaches an existing install, since the templates are copied once.

- **The command.** `@robkit/core` ships a `robkit-core` command:
  - `robkit-core start` runs the provision step when its settings are present, migrates core's database, then serves. The serving process never sees `ROBKIT_ADMIN_DATABASE_URL` or `ROBKIT_DB_SECRET`, as `env -u` arranges today.
  - `robkit-core migrate` migrates core's database.
  - `robkit-core serve` serves, for `pnpm dev`, which has already provisioned and migrated.
- **The signing key is ready before core listens.** The key `main.ts` loads today and throws away is the one the app uses, so the first sign-ins after a restart don't wait on it inside a transaction ([review](../research/review-2026-11-09.md), "Core").
- **Provisioning moves out of `@robkit/dev`.** The code that gives each app its schema and role belongs with core, which is what runs it in production. Core's image then no longer carries the dev runner. `@robkit/dev` imports it from where it lands. If the package graph makes that wrong, say why in the comments and choose the nearest shape that keeps the dev runner out of core's image.
- **Provisioning refuses to alter itself.** It refuses a slug that names the role it is connected as, or an existing role with `rolsuper` ([review](../research/review-2026-11-09.md), "Provisioning alters any existing role").
- **`apps/core` has no source.** It is a `package.json` whose `dev`, `migrate` and `start` scripts run `robkit-core`, with the dependencies core needs.
- **An owner can still write their own core.** `createApp`, `createDatabase`, `migrate` and the rest stay exported. `@robkit/core`'s README shows a `main.ts` that uses them, for an owner who needs to change how core starts.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `apps/core` in a new install holds a `package.json` and no `src`
- [ ] `robkit-core start` provisions, migrates and serves, and the serving process's environment holds neither secret
- [ ] `pnpm dev` runs core through `robkit-core serve`, and restarts it when a linked checkout's core changes, as `node --watch` does today
- [ ] Core's production image holds no `@robkit/dev`
- [ ] Provisioning refuses its own role's name and a superuser's, with a message that names the slug
- [ ] The README's own-core example compiles under the doc-examples check
- [ ] The whole-stack and production tests pass
- [ ] The PR's CI `gate` job passes on GitHub
