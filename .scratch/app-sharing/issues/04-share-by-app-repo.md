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
- **The manifest** is the `robkit` field of the app's package.json: `name`, `description`, `stack`, `contract`, `access` and `icon`. `robkit add` writes all of them; round two added the `description` question. The package name stays `@internal/<slug>-app`, since the Dockerfile builds by it, and `install --as` rewrites it.
- **The contract version is 1, and robkit's code says which versions an install runs** (`runsContracts` in `src/manifest.ts`). An install doesn't declare it in a file: it runs what its `create-robkit` dev dependency runs, so it can't drift from the code. `install` and `update` refuse another version: "It was made for robkit contract 2, and this install's robkit runs contract 1. Update robkit in this install, or ask its author for a version made for contract 1."
- **The contract** is `@robkit/*`, the fixed packages (`@internal/ui`, `@internal/theme`, `@internal/core-client`, `@internal/tsconfig`) and the catalog. `robkit check` has two new rows: an app imports nothing outside its folder but its dependencies, and its dependencies are npm versions, `catalog:` names the contract has, or `workspace:` on a fixed package. A `catalog:` dependency travels as it is, since every install of one robkit version has the same catalog; anything else must be pinned in the app's package.json. `share` and `install` both run the check and refuse an app that fails it.
- **Seeds.** `seed.sql` sits at the app's root. When the provision step makes an app's schema, it comments it `robkit: seed pending`. After migrating, the app's migrate script runs the seed as the app's role and clears the comment, in one transaction, so a failed seed is tried again on the next start and a done one never runs twice. An app without a seed just clears the mark. (Round two moved this from `provisionApps` into the migrate script, so production seeds too.)
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
- **Two repos.** An owner commits an app's changes in its own folder, and robkit commits `robkit.json` in the install after each add, share, install or update. A deploy refuses until every app's changes are shared. A bundle lives in the install's own repo.
- **Deploy needs reachable sources.** A deploy clones every app repo from its recorded source. An app shared to a path on the owner's machine, or to a private repo without credentials on the build host, can't deploy. A bundle needs nothing outside the install.
- **No registry.** A URL or a path is the whole sharing story. Discovery would need a list of URLs.
- **Code lives in one place.** The app's history, author and upstream come with it. A bundle is a snapshot.

Weak spots:

- Two installs that both add migrations to one app conflict in Drizzle's `meta/_journal.json`, and drizzle-kit names migrations by index, so both are `0001_…`. The owner fixes it by hand and runs `pnpm db:generate` again.
- turbo's `--affected` can't see inside an app repo, so deploy also compares `robkit.json` revisions.
- `examples/guestbook` in this repo is plain files, not a repo. The test and `TESTING.md` make it one.
- The launcher shows an app's slug, not its manifest name, as before.

### Round two (2026-11-05)

R's bar: sharing an app is as painless as `npm create robkit`, so each line of `TESTING.md` that isn't essential was treated as a defect in the tool. No question went to R; each choice is below.

- **Each install has its own Compose project.** init writes `name: <folder>-<6 hex>` into `compose.yaml`, so two installs in folders of one name no longer share a Postgres container and volume, and `docker compose` in an install's folder reaches only its own. The generator takes the name as an option, so its snapshot stays fixed; init picks the suffix. `COMPOSE_PROJECT_NAME` and `-p` still win, which the dev runner's and e2e tests use for cleanup. `TESTING.md` lost every `COMPOSE_PROJECT_NAME` and `-p`.
- **Seeds run in production.** Core's provision step can't seed: it runs before the app's tables exist and has none of the app's files. So the step now only marks a schema it makes `robkit: seed pending`, under `pnpm dev` and in production alike, and each stack's `src/migrate.ts` runs `seed.sql` once after migrating and clears the mark in one transaction. The app's container runs that script as it starts, so production seeds exactly as dev does, through the same code. `provisionApps` no longer seeds. The cost: the seed lives in three copies of `migrate.ts` (both stack templates and the guestbook, which a test keeps identical to its stack's), and an app made before this round seeds nowhere until its `migrate.ts` is replaced. `tooling/e2e/src/seed.test.ts` runs each stack's real migrate script against a test Postgres: seeds once as the app, never seeds a schema made before, retries a failed seed, keeps to its schema. The production e2e's installed-app test asserts the guestbook's two seeded messages.
- **A deploy refuses what it wouldn't build as the owner has it.** `robkit deploy`, and a dry run, list each app repo never shared, shared only to a folder, or with an edit or commit it hasn't shared, and an uncommitted `robkit.json`, each with the command that fixes it. Chosen over sharing for the owner: a share pushes and changes `robkit.json`, which the build sees only once the install is pushed too, and a folder or a missing URL needs the owner to pick where the app lives. A fresh clone in CI always passes.
- **An installed app keeps its upstream.** Found while making the deploy check: after `update`, B's recorded commit is a merge only B has, so B must share before it can deploy. Sharing to a repo of B's own used to move `origin` and leave `update` pulling from B itself. `install` now adds an `upstream` remote, `update` pulls from it, and `robkit.json` records it when it differs from the source, so a clone gets it back. The deploy check tells an installed app to share "to a repo of this install's own".
- **robkit commits `robkit.json` itself.** `add`, `share`, `install` and `update` commit `robkit.json`, `.gitignore` and `pnpm-lock.yaml` in the install, after refreshing dependencies. They skip an install with no commit yet (the first commit is the owner's, and `create-install` makes none) and one with other changes staged, saying so. The pre-commit hook runs on that commit. `TESTING.md` lost its `git add robkit.json && git commit`.
- **The guard's paths.** `robkit check` has a row refusing any string in an app that starts with `/_robkit/` or is `/_robkit`, which is how Hono's routes and Start's route tree name a path. Cheap and catches the usual cases; a path built another way gets past it.
- **Tidy-ups.** `newSlugProblem` moved to `src/new-slug.ts`, so `add.ts` and `app-repo.ts` no longer import each other. `robkit add` asks "What does it do?" after the name, and takes `--description`; an empty answer leaves it out.
- **TESTING.md.** No `pnpm()` function or `source nvm` line: `nvm use 24` once per terminal is enough, since `.bashrc` loads nvm and Node 24 has pnpm. No `git status` or `git log` whose output R had to read, no manual commit, no Compose names. The guestbook's repo is ready at `~/robkit-demo-b/guestbook`, with the block that remakes it at the end. The refusals step moved out: `app-repo.test.ts` covers each. Steps 1 to 7 went from 33 shell lines (50 commands) to 23 (35); the whole file from 42 lines (65 commands) to 28 (46).

Round two's proof:

- The WSL gate (`pnpm turbo run lint typecheck test`) passed 46 of 46 tasks, with 777 tests passed and 1 skipped. Its share e2e passed 4 of 4. One earlier gate run timed out "leave robkit.json to the owner when other changes are staged" at 20 seconds under a load average near 20; alone with retries off it passed three times in about a second.
- `test:production` passed 10 of 10, including the installed guestbook's two seeded messages.
- Every command in `TESTING.md` ran as written in WSL from a clean slate, with `pnpm dev` in the background and a script for the browser: the guest saw the guestbook's seed and "Notes from install A" in A, the same heading in B, then "Notes from install A, shared again" above "Your id in install B:", and psql printed the one seeded row both times. A fresh copy of the sample's repo is at `~/robkit-demo-b/guestbook`.

Still weak after round two:

- `robkit dev` prints "robkit is running" before each app listens, so a browser opened at once can get a 502 for a second or two. The scripted browser waits; a person rarely notices.
- The auto-commit never fires in `TESTING.md`: `create-install` makes no commit, so robkit leaves the first one to the owner. It also runs the install's pre-commit hook, so it needs pnpm on the PATH.
- The deploy check trusts the local remote-tracking refs and doesn't fetch. It can't tell that the build host lacks credentials for a private repo.
- The `/_robkit/` row is a string heuristic.
- The seed lives in three copies of `migrate.ts`, and an app made before this round seeds nowhere until its `migrate.ts` is replaced.
- The psql line in step 6 still has R read a row; nothing in the browser shows the seed of a new app.
