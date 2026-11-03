# 22: App slugs are checked when `pnpm dev` starts

**What to build:** An install's apps are the folders under `apps/`, and each folder name is the app's slug, subdomain and Postgres role. Today any folder name gets a subdomain, and only the database step checks the slug, so `apps/my-app` gets halfway through start-up and then fails. After this ticket, `pnpm dev` refuses a folder that isn't a valid slug before it starts anything, with the slug rule's message. Finding the apps and provisioning a database share one slug rule, which `robkit add` (ticket 10) reuses.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `pnpm dev` with an `apps/my-app` folder exits before starting Postgres or any app, and names the folder and the rule
- [ ] The rule lives in one place: finding the apps and provisioning a database both use it
- [ ] A valid install starts exactly as before

Source: the architecture review of 2026-11-03 (see the map)
