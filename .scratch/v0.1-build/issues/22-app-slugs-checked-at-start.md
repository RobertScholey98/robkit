# 22: App slugs are checked when `pnpm dev` starts

**What to build:** An install's apps are the folders under `apps/`, and each folder name is the app's slug, subdomain and Postgres role. Today any folder name gets a subdomain, and only the database step checks the slug, so `apps/my-app` gets halfway through start-up and then fails. After this ticket, `pnpm dev` refuses a folder that isn't a valid slug before it starts anything, with the slug rule's message. Finding the apps and provisioning a database share one slug rule, which `robkit add` (ticket 10) reuses.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `pnpm dev` with an `apps/my-app` folder exits before starting Postgres or any app, and names the folder and the rule
- [x] The rule lives in one place: finding the apps and provisioning a database both use it
- [x] A valid install starts exactly as before

Source: the architecture review of 2026-11-03 (see the map)

## Comments

- **The rule.** `slugProblem(name)` in `packages/dev/src/slug.ts`, exported from `@robkit/dev`, returns why a name can't be a slug, or `undefined`. Its shape fits a prompt's `validate`, for ticket 10.
- **For ticket 23.** `discoverApps` now rejects, naming the folder, before anything starts, so every `App` it returns has a valid slug. `provisionDatabase` still checks the slug itself, because it is exported and inlines the slug into DDL. Keep that check when provisioning moves into its own step. `runDev` prints discovery's error and returns 1 before Compose starts. If the provision step finds the apps itself, it gets the same check for free.
- **Tests.** The runner test "refuses an app folder that isn't a slug before starting anything" asserts the exact output and that Compose created no container (`ps -a`). Like the other runner tests, it needs Linux or macOS.
