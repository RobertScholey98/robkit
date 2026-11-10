---
"create-robkit": minor
---

`pnpm robkit upgrade [version]` moves an install to a newer robkit: the newest on the registry, or the version given. It updates the catalog's entries for robkit's packages and installs them, then the new robkit replaces the lint policy in `tooling/eslint` and the Go module in `vendor/robkit/go`, adds or raises the catalog entries it needs, and raises `packageManager`. It never changes your apps, the hub or admin, and prints create-robkit's changelog between the two versions, which says what to change by hand. It refuses, before it changes anything, without git or a commit, with a change not committed, while `pnpm dev` runs, for a version that isn't newer, and where a file it writes, a folder it replaces or a folder above one is a link. If `pnpm install` fails, it puts back every file it changed.
