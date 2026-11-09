# 19: `robkit upgrade`

**What to build:** Milestone 2 moves platform logic out of an install's files and into packages so that a fix reaches an install by a version bump ([ADR 0008](../../../docs/adr/0008-packages-update-apps-are-owned.md)). Nothing does the bump. An owner would have to know which lines of `pnpm-workspace.yaml` are robkit's, and which copied files go with them.

- **The command.** `pnpm robkit upgrade` moves an install to the newest robkit, or to the version given. It sets the catalog's entries for `create-robkit` and every `@robkit/*` package to that version, adds any entry the new version's templates need, and runs `pnpm install`.
- **The copies robkit owns come too.** It refreshes what an install holds as a copy of robkit's own files and the owner isn't expected to edit: `vendor/robkit/go` when the install has a Go app, and the lint policy in `tooling/eslint`. A file the owner changed is left alone and named, with how to see the difference.
- **Apps, the hub and admin are the owner's.** It never rewrites them. Where a release needs a change in them, it prints the release's notes for that, from the changelog the release carries.
- **It says what it did.** The old and new version, what it changed, and to run `pnpm lint`, `pnpm typecheck` and `pnpm test`.
- **A linked install** has nothing to upgrade, and says so.
- **Docs.** The install's README and `AGENTS.md`, and create-robkit's README.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] With two versions in the local registry, `robkit upgrade` moves an install from the older to the newer, and the install then installs, lints, typechecks and builds
- [ ] `robkit upgrade <version>` moves to that version, and refuses one the registry doesn't have with a message that says so
- [ ] `vendor/robkit/go` and the lint policy follow the new version; a policy file the owner edited is left alone and named
- [ ] No file under `apps/` changes
- [ ] In a linked install it prints one line and changes nothing
- [ ] The PR's CI `gate` job passes on GitHub
