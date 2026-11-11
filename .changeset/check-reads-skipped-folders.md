---
"create-robkit": minor
---

`robkit check` refuses a relative import into a folder it doesn't read: `node_modules`, `dist`, `build`, a dot-folder or a symlinked folder, including a link part-way along the import's path. If `pnpm lint` now fails on one of your apps, move that source into the app's own folders, or import the package by its name.
