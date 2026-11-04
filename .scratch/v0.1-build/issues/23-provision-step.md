# 23: Provisioning is its own step

**What to build:** Giving each app with a database its schema and role, then running its `migrate` script, becomes a step that runs on its own, outside `pnpm dev`. `pnpm dev` calls the step and then starts the apps as before. Ticket 10 needs this as its provision step, and ticket 11 runs it before a deploy. The step can be tested against Postgres without starting the proxy or any app.

**Blocked by:** 22

**Status:** done

- [x] Running the step twice on the same install changes nothing the second time, and a test proves it without starting any app
- [x] An app's `migrate` runs after its schema and role exist, and before the app starts
- [x] `pnpm dev` behaves as before, and the whole-stack test passes
- [x] Role passwords work as today: a fresh one each run, handed to the app as `DATABASE_URL`. Where they come from in production stays ticket 10's open question

Source: the architecture review of 2026-11-03 (see the map)

## Comments

- **The step.** `provisionApps(root, { adminUrl, env, signal })` in `@robkit/dev`. It finds the apps itself, so it refuses a folder that isn't a slug the way `pnpm dev` does. For each app with a `migrate` script, in slug order, it creates or updates the schema and role, then runs `pnpm run migrate` in the app's folder with `env` plus the app's `DATABASE_URL`. It stops at the first failure and returns each app's `DATABASE_URL` by slug. `runDev` calls it after Compose is up and before any app starts. (Chosen in the build, awaiting R's review: the step takes the install's folder rather than a list of apps, and has no command of its own yet.)
- **For ticket 10.** `robkit add` only writes files. The new app gets its database the next time the step runs, which is the next `pnpm dev`. The step still sets a fresh password on every run, so the production password question stays open here.
- **For ticket 11.** A pre-deploy step needs a command that calls `provisionApps` with the production admin URL. Once production passwords stop changing on each run, the returned URLs are what each app's env needs.
- **Tests.** `provision.test.ts` runs the step against the test Postgres on a fixture install whose `migrate` connects as the app and creates a table, and checks a second run leaves roles, schemas, grants and tables as they were. Like the runner tests, it needs Linux or macOS, because it runs `pnpm` without a shell.
