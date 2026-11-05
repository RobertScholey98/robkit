# 04: Share apps as git app repos (approach B)

**What to build:** every app is its own git repo, and portable from the moment it's made. Instead of copying a snapshot out (ticket 03), an app keeps its upstream, so updates flow with git. The other half of the side-by-side comparison with 03.

- **Portable by contract.** An app may import only what every install of its robkit version provides: the `@robkit/*` packages and the install's fixed workspace packages (`packages/ui`, `packages/theme`, `packages/core-client`), whose names and API are the same in every install now that the stack is one (ticket 01). Anything else it needs lives inside its own folder. `robkit check` enforces it, so an app that breaks it can't be shared by accident. No import rewriting.
- **`robkit add`** makes each app its own git repo (nested in the install, ignored by the install's repo), with a manifest naming its stack, icon, default access, description and robkit contract version.
- **`pnpm robkit share <slug> [<remote or path>]`** publishes the app repo: pushes it to a remote, or creates a bare or plain repo at a local path. The install remembers the remote.
- **`pnpm robkit install <git URL or path>`** clones an app into `apps/<slug>` (`--as <slug>` to rename, refused if taken), checks its contract version, installs, and records where it came from in `robkit.json`.
- **`pnpm robkit update <slug>`** pulls the app's upstream into the owner's copy with git, so the owner's own edits survive and conflicts show as git conflicts.
- **Database:** migrations and an optional seed file travel with the repo. The seed runs once, when the app's schema is first made, through the provision step.
- **Stack-agnostic:** nothing in share, install or update reads a stack's file layout.

**For R to test tomorrow:** a sample app repo that lives outside any install (for example a guestbook, with a seed), and a `TESTING.md` at the worktree's root with copy-paste commands for R's whole acceptance test: create install A from this worktree, install the sample, add an app, change its frontend and its schema (with a new migration), share it, create install B, install it, see the change and the seed there, then change it again in A and `update` it in B. Say where WSL is needed.

**Blocked by:** 02

**Status:** done

- [x] An app `robkit add` makes is its own git repo and passes `robkit check`'s portability rule
- [x] `robkit check` refuses an app that imports from outside its folder, other than the contract packages
- [x] `pnpm robkit share` and `pnpm robkit install` move an app from install A to a fresh install B, and a guest opens it from the launcher
- [x] A schema change made in A reaches B as a migration; the seed runs once
- [x] `pnpm robkit update` brings a later change from A into B, keeping B's own edits
- [x] Both stacks share, install and update
- [x] An app made for a contract version the install can't run is refused with a clear message
- [x] A sample app repo and `TESTING.md` exist, and R's acceptance test passes end to end in a test

**Answered (R, 2026-11-05):** schema plus an optional seed travels, never data.

Source: [App sharing PRD](../PRD.md)

## Comments

What the build chose. No question went to R; where the ticket left a choice, the build took the simplest option that keeps R's test painless.

- **Nested repos, not submodules.** Each app but core, the hub and admin is a plain git repo in `apps/<slug>`. The install's `.gitignore` lists it (`/apps/<slug>/`), and `robkit.json`'s `apps` records its `source` and `revision`. Submodules were ruled out: an app that was never shared has no URL to record, a submodule pointing at a path on this machine breaks every clone of the install, Coolify's included, and submodules bring detached heads and two-step commits. `robkit add` makes the repo with a first commit, so every app is an app repo from the start.
- **Deploy still works from a clone.** CI runs `pnpm robkit install` with no arguments after `pnpm install`, which clones each recorded app repo back in at its revision. Coolify builds the Dockerfile from its own clone, so the prune stage runs `robkit/fetch-app.js`, a dependency-free script that clones the one app it builds. `robkit deploy` also redeploys an app whose recorded revision moved since `TURBO_SCM_BASE`, since turbo can't see inside an ignored repo's history.
- **turbo and Prettier see ignored files.** turbo hashes only what git tracks, so an app repo's edits never changed its hash and turbo replayed a stale build from cache. The install's `turbo.json` now gives `build`, `typecheck` and `test` explicit `inputs` (`**`, minus `node_modules`, `.git`, `.turbo` and `dist`). `turbo prune` also copies only what git would track, so every added app built from an empty folder in the image; the Dockerfile drops the app's `.gitignore` line before pruning. Prettier reads `.prettierignore` instead of `.gitignore`, for the same reason.
- **The manifest** is the `robkit` field of the app's package.json: `name`, `description`, `stack`, `contract`, `access` and `icon`. `robkit add` writes all but `description`, which it doesn't ask for. The package name stays `@internal/<slug>-app`, since the Dockerfile builds by it, and `install --as` rewrites it.
- **The contract version is 1, and robkit's code says which versions an install runs** (`runsContracts` in `src/manifest.ts`). An install doesn't declare it in a file: it runs what its `create-robkit` dev dependency runs, so it can't drift from the code. `install` and `update` refuse another version: "It was made for robkit contract 2, and this install's robkit runs contract 1. Update robkit in this install, or ask its author for a version made for contract 1."
- **The contract** is `@robkit/*`, the fixed packages (`@internal/ui`, `@internal/theme`, `@internal/core-client`, `@internal/tsconfig`) and the catalog. `robkit check` has two new rows: an app imports nothing outside its folder but its dependencies, and its dependencies are npm versions, `catalog:` names the contract has, or `workspace:` on a fixed package. A `catalog:` dependency travels as it is, since every install of one robkit version has the same catalog; anything else must be pinned in the app's package.json. `share` and `install` both run the check and refuse an app that fails it.
- **Seeds.** `seed.sql` sits at the app's root. When the provision step makes an app's schema, it comments it `robkit: seed pending`. After migrating, `provisionApps` runs the seed as the app's role and clears the comment, in one transaction, so a failed seed is tried again on the next `pnpm dev` and a done one never runs twice. An app without a seed just clears the mark.
- **share** with no target makes a bare repo at `../robkit-apps/<slug>.git`, sets it as `origin` and pushes. Later shares push to `origin`. A rejected push says to run `robkit update` first.
- **install** takes a path or a URL, names the app after the repo unless `--as` names it, and refuses a taken slug (suggesting `--as` or `update`), a platform slug, a repo with no `robkit` field, and a contract it can't run. It removes the clone on any refusal.
- **update** commits the install's own edits to the app ("Keep this install's changes to <slug>"), fetches, checks the incoming contract, and runs `git merge`. A conflict stays a git conflict, and robkit names the files and the commands to finish or abort it. A second `update` during an unfinished merge refuses.
- **Stack-agnostic.** Nothing in share, install or update reads a stack's files. The unit tests run share, install and update on both stacks, and the e2e shares a Start app and installs a Hono one.
- Not built: `robkit check --fix` moving outside imports into `shared/`. The check names the import and the rule instead.

Proof:

- The WSL gate (`pnpm turbo run lint typecheck test`) passed 46 of 46 tasks, with 752 tests passed and 1 skipped.
- The share e2e (`pnpm --filter @internal/e2e test:share`, which `test` runs after the other suites) passed 4 of 4 in WSL. It runs R's acceptance test: A installs the guestbook from its own repo, a guest sees its seed; A adds a Start app, changes its page and schema with `pnpm db:generate`, adds a seed and shares; B installs it and a guest sees the change, and psql shows the seeded row; A changes it again and shares, B edits another line, updates, and a guest sees both, with the seed still run once.
- `test:production` passed 10 of 10. Its new test installs the guestbook, commits the install, and builds the guestbook's image from a clone of the install, which has no app repos, so the Dockerfile fetches it at the recorded commit; a guest then opens it over https. The first run failed: both the added app and the installed one built from an empty folder, which is how the `turbo prune` problem above showed.
- Every command in `TESTING.md` ran as written in WSL, in order, with `pnpm dev` in the background and a script standing in for the browser: the guest saw the guestbook's seed, then "Notes from install A" in B, then "Notes from install A, shared again" above "Your id in install B:", and psql showed one seeded note each time. The run caught two wrong hints, now fixed: `install --as admin` suggested `robkit update admin`, and a taken slug said "Choose another name" before its own hint. A ready copy of the sample's repo is at `~/robkit-demo-b/guestbook` in WSL.

What R should compare with approach A (ticket 03):

- **Updates.** Here an update is a git merge, so B's own edits survive and conflicts look like any git conflict. A bundle has to diff or overwrite.
- **Two repos to commit.** An owner commits an app's changes in its own folder, and commits `robkit.json` in the install after each share, install or update. Forgetting the second means CI and Coolify build the old revision. A bundle lives in the install's own repo.
- **Deploy needs reachable sources.** A deploy clones every app repo from its recorded source. An app shared to a path on the owner's machine, or to a private repo without credentials on the build host, can't deploy. A bundle needs nothing outside the install.
- **No registry.** A URL or a path is the whole sharing story. Discovery would need a list of URLs.
- **Code lives in one place.** The app's history, author and upstream come with it. A bundle is a snapshot.

Weak spots:

- Production never runs a seed: only `pnpm dev`'s provision step does. Core's container provisions in production, but doesn't know the app's files.
- Two installs that both add migrations to one app conflict in Drizzle's `meta/_journal.json`, and drizzle-kit names migrations by index, so both are `0001_…`. The owner fixes it by hand and runs `pnpm db:generate` again.
- `robkit.json`'s revision moves only on share, install and update. An owner who commits in an app repo and pushes the install deploys the last recorded revision until they share again.
- turbo's `--affected` can't see inside an app repo, so deploy also compares `robkit.json` revisions. A change committed in the app but not shared reaches no deploy.
- `examples/guestbook` in this repo is plain files, not a repo. The test and `TESTING.md` make it one.
- The launcher shows an app's slug, not its manifest name, as before.
- Nothing stops an imported app from routing under `/_robkit/`, which the guard owns (ticket 02's note).
- `add.ts` and `app-repo.ts` import each other. Only functions cross, so it works, but `newSlugProblem` could move to its own module.
- `TESTING.md` sets `COMPOSE_PROJECT_NAME` on `pnpm dev`, because Compose names a project after its folder and approach A's `install-a` would otherwise share a Postgres volume with this one.
