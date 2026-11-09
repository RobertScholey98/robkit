# 18: Add an app while `pnpm dev` runs

**What to build:** The README tells a new owner to stop `pnpm dev` before `pnpm robkit add` and start it again after. The runner reads `apps/` once, when it starts, and applies migrations once, when it starts. So adding an app, or changing a table, means a restart. Neither should.

- **The runner can be told things.** `robkit-dev` listens on a local control port, on loopback, and writes a small state file in the install (its pid, the port and a token) that it removes when it stops. The `robkit` command reads the file to know whether `pnpm dev` is running and how to reach it. A stale file from a killed run is noticed and ignored. The file is kept out of git.
- **`robkit add` tells it.** Once the new app's files are written and its dependencies installed, `robkit add` tells the runner. The runner checks the app's slug and manifest, gives it a port, provisions its schema and role, runs its `migrate` script, starts it, and routes its subdomain. `robkit add` then prints the app's address. With no `pnpm dev` running it says to run `pnpm dev`.
- **Core learns of it.** Core reads `ROBKIT_APPS` when it starts, so the runner restarts core with the new list. Sessions live in the database, so nobody is signed out.
- **One app can't take the rest down.** An app that fails to start, or exits while it is being added, prints its problem and leaves every other app answering. Today any app's exit stops the whole runner; that stays true only for an app that was running.
- **A new migration applies without a restart.** After `pnpm db:generate`, one command asks the runner to run that app's `migrate` script with the app's own credentials, which only the runner holds. Name the command and put it in each stack's `AGENTS.md`. With no `pnpm dev` running it says to start it, which migrates.
- **Removing an app** still needs a restart of `pnpm dev`. Say so in the install's `AGENTS.md`.
- **Docs.** The README's quickstart loses "Stop `pnpm dev` first".

**Blocked by:** 15, 17

**Status:** ready-for-agent

- [ ] With `pnpm dev` running, `pnpm robkit add notes` brings `notes.<domain>` up with no restart, guarded, with its database migrated, and prints its address
- [ ] The launcher shows the new app, and a guest signed in before the add is still signed in after it
- [ ] An added app whose start fails prints the problem, and every other app keeps answering
- [ ] A migration generated while `pnpm dev` runs is applied by the one command, and the app sees the new table without a restart
- [ ] The control port refuses a request without the state file's token, and one that doesn't come from loopback
- [ ] A state file left by a killed `pnpm dev` doesn't stop the next one, or make `robkit add` wait
- [ ] The whole-stack test adds its second app while the install runs
- [ ] The PR's CI `gate` job passes on GitHub
