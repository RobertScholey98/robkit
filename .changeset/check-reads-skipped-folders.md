---
"create-robkit": minor
---

`robkit check` refuses a relative import into a folder it doesn't read: `node_modules`, `dist`, `build`, a dot-folder or a symlinked folder, including a link part-way along the import's path. If `pnpm lint` now fails on one of your apps, move that source into the app's own folders, or import the package by its name. A `.d.ts` file may still import another from one of those folders, as the `next-env.d.ts` Next writes does, since it holds types, not code.

A new install's `AGENTS.md` says the check is a lint, not a boundary, and names what holds an app: its database role, its app token's audience and its container's environment.
