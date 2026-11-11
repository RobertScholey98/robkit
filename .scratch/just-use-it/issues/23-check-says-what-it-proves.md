# 23: `robkit check` says what it proves

**What to build:** `SECURITY.md` leans on `robkit check` to hold an imported app to the install's layer rule. It reads source text, and the review found a dozen ways an app can reach `@robkit/core` or another app's files that it doesn't see ([review](../research/review-2026-11-09.md), "`robkit check` skips folders" and "compares specifier text only"). Chasing every alias and computed name is a race a source scan can't win, and refusing every computed import would stop honest code, such as loading a language file by name. The check is a lint: it catches an app that breaks the rule by mistake. What holds an app that means harm is its database role, which reaches only its own schema, its token's audience, and its container's environment, which holds its own `DATABASE_URL` and none of core's secrets. This ticket closes the one cheap hole and makes the docs say that.

- **Skipped folders.** A relative import into a folder the scan skips fails, with a message that says to keep source out of them. The scan skips `node_modules`, `dist`, `build`, dot-folders and symlinked folders. The check looks at each folder along the import's path on disk, so a link part-way along is found. Today it works the target out from the import's text alone.
- **Honest docs.** `SECURITY.md`'s "What an imported app can and can't do" says `robkit check` catches mistakes and isn't a boundary, names the three things that are, and tells the owner to read an imported app's code. The install's `AGENTS.md` describes the check the same way.
- **Not the image.** An app's image isn't one of the three. The install's `Dockerfile` runs `turbo prune` for the app, which brings every workspace package the app's `package.json` names, and `robkit check` doesn't read `package.json`. The docs don't claim an image holds only the app's own files.

Computed imports, `createRequire`, aliases, tsconfig `paths`, a Vite `resolve.alias`, a `package.json` `imports` entry, an absolute path, a `file:` specifier and a cookie name built from pieces are not chased. List them in the comments, and in `SECURITY.md`, as known ways past the lint.

A medium-effort worker builds this. The words above are the decision. Don't widen the check.

**Blocked by:** 03

**Status:** done

- [x] A relative import into `node_modules`, `dist`, `build`, a dot-folder or a symlinked folder fails, with a test for each
- [x] A relative import whose path passes through a symlinked folder part-way along fails
- [x] A new install's own apps, on every stack, still pass `robkit check`
- [x] The new message names the file, the line, the rule and what to do
- [x] `SECURITY.md` says what the check proves, names the role, the token's audience and the container's environment as the boundaries, and lists the known ways past the lint
- [x] The install's `AGENTS.md` describes the check as a lint, in the same words
- [x] No doc says an app's image holds only its own files
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 3, added by the lead

Ticket 20 added a line to the map for PRD decision 18, "`robkit check` is a lint, not a boundary", marked not built yet. Update that line when this merges.

`robkit upgrade` (ticket 19) refuses a link at or above any path it writes. That check is upgrade's own and shares nothing with `robkit check`'s scan, so a symlinked folder still needs this ticket.

The docs site, built beside this milestone on the `docs-site` branch, has a page on the layer rule (docs-site ticket 10) and a command reference (20). Both describe `robkit check` as it is before this ticket. Say in this ticket's comments what the check prints or claims differently afterwards. The docs site's last build ticket (26) works from that.

### From the ticket round, 2026-11-11

Taken:

- Opus: "its own image, which holds only its own files" was wrong. The install's `Dockerfile` runs `turbo prune`, which brings whatever workspace packages the app's `package.json` names. The third boundary is the container's environment. PRD decision 18 and the map said the same wrong thing, and the lead corrected both.
- Both: the criteria missed `build` and `node_modules`, which `check.ts` skips too, and a link part-way along a path. The scan works a target out from the import's text (`posix.join`).
- Sol: a criterion for the install's `AGENTS.md`, and absolute and `file:` specifiers in the list of known ways past.

Both reviewers would give this ticket a medium-effort worker.

### From the build, 2026-11-11

Chosen in the build:

- The skipped-folder refusal is a fifth row of `layerRule`, so it prints like the others: `file:line:column  rule`. Its text says what to do: keep source out of those folders, and import a package by its name. It applies to every app and shared package, core included.
- The check looks at each part of the target's path from the install root with `lstat`, then `stat`. A part along the way named `node_modules`, `dist`, `build` or starting with `.` fails by its name alone. The last part fails by name only when it is a folder on disk, so `./build.ts` passes. A symlink to a folder fails wherever it sits. A symlinked file doesn't: the scan reads those.
- A target above the install root, such as `../../../../x.ts` from an app, gets only the "leaves the app" rule, not this one.
- A path that stops existing part-way, or runs through a file (`ENOTDIR`), is checked by name from there on.
- The symlink tests use `symlink(..., "junction")`, which Windows makes without admin rights and Linux ignores, so they run on both.
- The changeset is `minor`, since an install whose source imports from one of those folders now fails `pnpm lint`.

The known ways past the lint, as `SECURITY.md` lists them:

- An import whose name is computed, such as `import(name)`.
- `createRequire`.
- An alias: tsconfig `paths`, a Vite `resolve.alias`, or a `package.json` `imports` entry.
- An absolute path, or a `file:` specifier.
- A cookie name built from pieces, such as `"robkit_" + "session"`.

For the docs site:

- An app's author: `robkit check` (and so `pnpm lint`) prints a new message for a relative import into `node_modules`, `dist`, `build`, a dot-folder or a symlinked folder: `<file>:<line>:<column>  Layer rule: an app or shared package imports no file under node_modules, dist, build, a dot-folder or a symlinked folder, since robkit check doesn't read them. Keep source out of those folders, and import a package by its name.`
- An owner: a new install's `AGENTS.md` lists that fifth rule, and says the check is a lint, not a boundary. It names the three things that hold an app: its database role, its app token's audience, and its container's environment. It says an app's image isn't one of them, because `turbo prune` brings in every workspace package the app's `package.json` names.
- The layer rule page (docs-site ticket 10) should say the check is a lint, name the three boundaries, and list the known ways past it. The command reference (ticket 20) should add the new refusal.
- A guest sees nothing different.

### Merged

Added by the lead. PR 102 merged into `m4-nothing-skipped` on 2026-11-11, with `gate` green on `b3a9d7c`. The build's own full gate in WSL passed 75 of 77 tasks. `@robkit/dev` and `@internal/e2e` timed out there under the machine's load, and passed alone.

Reading the diff, the lead found two ways past the lint that the list left out, and added them to `SECURITY.md` after the merge:

- A symlinked file. The check reads it, but works out its relative imports from the link's folder (`usesIn` joins the specifier to the link's path), and Node resolves them from the real file's.
- A folder's name in another case, such as `./Dist/server.js`, on a file system that ignores case. `skips` matches a name exactly, and the scan skips the folder under the name it has on disk.

Both stay open: the check is a lint. The docs site's layer rule page takes its list from `SECURITY.md`.
