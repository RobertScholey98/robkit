# 19: `robkit upgrade`

**What to build:** Milestone 2 moves platform logic out of an install's files and into packages so that a fix reaches an install by a version bump ([ADR 0008](../../../docs/adr/0008-packages-update-apps-are-owned.md)). Nothing does the bump. An owner would have to know which lines of `pnpm-workspace.yaml` are robkit's, and which copied files go with them.

- **Two steps, because the old robkit doesn't know the new one.** `pnpm robkit upgrade` runs the robkit the install already has. That one can't hold the new version's Go module, lint policy or catalog needs. So:
  1. The installed robkit sets the catalog's entries for `create-robkit` and every `@robkit/*` package to the new version, the newest or the one given, and runs `pnpm install`.
  2. It then runs the newly installed robkit to finish: that one refreshes the copies of robkit's own files the install holds (`vendor/robkit/go` when the install has a Go app, and the lint policy in `tooling/eslint`), and adds or raises any catalog entry its packages need, then installs again if it changed one.
- **Git is the undo.** It refuses to run with uncommitted changes, and says to commit or stash first. It overwrites robkit's copies whole, and ends by saying to read `git diff` and commit. Every install starts with a commit (ticket 15), so there is always something to compare against.
- **Apps, the hub and admin are the owner's.** It never rewrites them. It prints create-robkit's changelog entries between the two versions, which is where a change the owner must make by hand is written, since a template change needs a changeset. Ticket 14 ships that changelog in the package.
- **It says what it did.** The old and new version, what it changed, and to run `pnpm lint`, `pnpm typecheck` and `pnpm test`.
- **A linked install** has nothing to upgrade, and says so.
- **Docs.** The install's README and `AGENTS.md`, and create-robkit's README.

**Blocked by:** 13, 14, 15

**Status:** ready-for-agent

- [ ] With two versions in the local registry, `robkit upgrade` moves an install from the older to the newer, and the install then installs, lints, typechecks and builds
- [ ] A catalog entry the newer version's packages need, and the older install lacks or holds too low, is there afterwards
- [ ] `robkit upgrade <version>` moves to that version, and refuses one the registry doesn't have with a message that says so
- [ ] It refuses a tree with uncommitted changes and changes nothing
- [ ] `vendor/robkit/go` and the lint policy match the new version afterwards, and no file under `apps/` changed
- [ ] It prints the changelog entries between the two versions
- [ ] In a linked install it prints one line and changes nothing
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 2, added by the lead

Checked against the code on 2026-11-10, after milestone 2 merged.

- **An app's files now call packages by name**: `guarded()`, `appDatabase(schema)`, `robkit-migrate`, `robkit()` or `withRobkit()`, and `serve(app)`. `apps/core` is a `package.json` whose scripts are `robkit-core start`, `migrate` and `serve`. Those names are public, like an export, and a later version keeps them. So upgrade has nothing to rewrite under `apps/`, and the criterion "no file under `apps/` changed" holds for core too.
- **What an install still holds of robkit's own, outside `apps/`**: the root `Dockerfile`, `compose.yaml`, `turbo.json`, `.github`, `tooling/eslint` and `vendor/robkit/go`. This ticket rewrites the last two. A fix to one of the others reaches an install through the changelog, by hand. Say so in the install's README, so an owner knows which files a version bump doesn't cover.
