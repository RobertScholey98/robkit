---
"create-robkit": minor
---

`pnpm robkit migrate <slug>` applies a new migration while `pnpm dev` runs. It asks the runner to run the app's `migrate` script with the database URL it gave the app, so the app sees the new tables without a restart and its password doesn't change. With no `pnpm dev` running, it says to start it, which migrates every app.
