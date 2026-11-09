# 16: Add an app while `pnpm dev` runs

**What to build:** The README tells a new owner to stop `pnpm dev` before `pnpm robkit add` and start it again after. The runner reads `apps/` once, when it starts. It should notice a new app the way a dev server notices a new file.

- **The runner watches `apps/`.** When a folder with a `package.json` appears, the runner checks its slug and manifest, gives it a port, provisions its schema and role, runs its `migrate` script, starts it, and routes its subdomain. It prints the new app's address.
- **Core learns of it.** Core reads `ROBKIT_APPS` when it starts, so the runner restarts core with the new list. Sessions live in the database, so nobody is signed out. If a cleaner way to tell a running core exists inside `@robkit/core`'s current design, take it and say so in the comments.
- **A folder that isn't ready is left alone.** `robkit add` writes the app in one move (ticket 14), then installs. The runner starts the app once its dependencies are installed, and says it is waiting until then. A bad slug or manifest prints the problem and leaves the rest running.
- **A removed app stops.** When an app's folder goes, the runner stops it and drops its route. Its schema and its row in core's catalog stay; ticket 20 covers the catalog.
- **`robkit add` says where the app is.** When `pnpm dev` is running it prints the app's address, and otherwise says to run `pnpm dev`.
- **Docs.** The README's quickstart loses "Stop `pnpm dev` first", and the install's `AGENTS.md` says an added app comes up by itself.

**Blocked by:** 14, 15

**Status:** ready-for-agent

- [ ] With `pnpm dev` running, `pnpm robkit add notes` brings `notes.<domain>` up with no restart, guarded, with its database migrated
- [ ] The launcher shows the new app, and a guest signed in before the add is still signed in after it
- [ ] An app folder with a bad slug prints the problem, and every other app keeps answering
- [ ] Deleting an app's folder stops its process and its route
- [ ] The whole-stack test adds its second app while the install runs
- [ ] The PR's CI `gate` job passes on GitHub
