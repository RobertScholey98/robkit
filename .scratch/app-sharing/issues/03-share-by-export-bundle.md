# 03: Share apps as export bundles (approach A)

**What to build:** `pnpm robkit export <slug>` turns an install's app into a standalone, self-contained app repo outside the install. `pnpm robkit import <path or git URL>` brings one into any install. A snapshot model: each export is a copy, and exporting again updates the same repo with a new commit.

**Export** writes, by default, to a sibling folder of the install (`../<slug>`, or `--out <dir>`):

- the app's own files
- `shared/`: R's idea. Any code the app imports from outside its folder (the install's `packages/ui`, `packages/theme`, `packages/core-client` or anything else in the workspace) is copied in, with the imports mapped to it, so the repo stands alone. `@robkit/*` packages aren't copied; they're the contract every install provides.
- concrete versions in place of `catalog:` and `workspace:`, so the repo installs on its own
- its migrations and an optional seed file, never data
- a manifest that names the app, its stack, icon, default access, description and the robkit contract version it was made for
- a short README that says how to import it
- `git init` and a commit, if the folder isn't a repo yet

**Import** copies the app into `apps/<slug>` (`--as <slug>` to rename, refused if taken), maps `shared/` back onto the install's own packages where they're the same and keeps the rest inside the app, turns versions the catalog already has back into `catalog:` and adds new ones to it, installs, and refuses an app made for a contract version the install can't run, saying why. The app's schema, migrations and seed then come up through the provision step, as for any other app. The seed runs once, when the app's schema is first made, never again.

**Stack-agnostic:** export and import read the workspace's imports and manifests, not a stack's file layout. Both stacks pass, and a new stack would need no change here.

**For R to test tomorrow:** a sample app repo that lives outside any install (for example a guestbook, with a seed), and a `TESTING.md` at the worktree's root with copy-paste commands for R's whole acceptance test: create install A from this worktree, import the sample, add an app, change its frontend and its schema (with a new migration), export it, create install B, import it, and see the change and the seed there. Say where WSL is needed.

**Blocked by:** 02

**Status:** done

- [x] `pnpm robkit export <slug>` writes a repo that installs, lints, typechecks and tests on its own
- [x] Code from outside the app's folder ends up in `shared/`, imports mapped to it
- [x] `pnpm robkit import <path|git URL>` adds the app to a fresh install, and a guest opens it from the launcher
- [x] A schema change made in install A reaches install B as a migration; the seed runs once
- [x] Both stacks export and import
- [x] Exporting again commits the change to the same repo; importing a newer export of an app already there says what to do
- [x] An app made for a contract version the install can't run is refused with a clear message
- [x] A sample app repo and `TESTING.md` exist, and R's acceptance test passes end to end in a test

**Answered (R, 2026-11-05):** R leans toward this approach. Schema plus an optional seed travels, never data.

Source: [App sharing PRD](../PRD.md)

## Comments

**Choices, and why**

- The manifest is the `robkit` field of the app's `package.json`, as before. It gains `name`, `stack`, `description` and `contract`, beside `access` and `icon`. `robkit add` and the example write `name`, `stack` and `contract`. One file stays the app's one manifest.
- The contract version is 1, in create-robkit's `src/contract.ts`. An install runs the contracts its create-robkit lists in `runsContracts`, so a newer robkit can list 1 and 2 and still import old exports.
- The seed is a SQL file the manifest names, `robkit.seed`, run as the app's own role. When the provision step makes an app's schema, it marks it with the comment `robkit: seed pending`. The seed and the clearing of that mark run in one transaction, after migrations. So a failed migrate or a failed seed retries on the next run, and a schema that existed before never seeds. SQL keeps it stack-agnostic: no stack code runs.
- The export is a pnpm workspace: the app at the root and each shared package under `shared/<folder>`, with their package names unchanged. So the app's imports need no rewriting on export, and import only rewrites what it keeps.
- `shared/` is found from the manifest's `workspace:` dependencies and from the imports `robkit check` already reads, so a stack's file layout doesn't matter. An import of a workspace package the manifest doesn't list gets added as `workspace:*`.
- The export adds what it needs to stand alone: `packageManager`, a `lint` script with ESLint, and a `test` script with Vitest (plus a `vitest.config.ts` with `passWithNoTests` if the app has none). Repo-only files (`README.md`, `eslint.config.js`, `.gitignore`, the `pnpm-workspace.yaml` comment) begin with "Written by robkit export.", and import leaves them out. Import also always leaves out `pnpm-workspace.yaml`, `pnpm-lock.yaml` and `vendor/robkit/`.
- Import maps a `shared/` package back onto the install's own when every file is byte for byte the same, and its `package.json` is the same once versions go back into the catalog. A package is mapped only if everything it depends on in `shared/` is mapped too. A package that differs stays in the app as `apps/<slug>/shared/<folder>`, renamed `@internal/<slug>-<folder>`, and the install's workspace gains `apps/*/shared/*`. Exporting that app again copies its kept packages as they are.
- A version the catalog has goes back to `catalog:`. A new one is added to the catalog, and a different one keeps the catalog's version, and import says so.
- Updating is: remove `apps/<slug>`, then import again. The schema and data stay, the next `pnpm dev` runs only new migrations, and the seed doesn't run again. Import's refusal of a taken slug says this. It's the simplest update that can't lose data, and git diff in the install shows what changed.
- A local path imports the folder as it is, uncommitted changes included. A git URL is cloned with `--depth 1`.
- The slug comes from the package name `@internal/<slug>-app`, which both robkit add and the export keep. `--as` overrides it.
- Export refuses an app that breaks the layer rule, and import removes the app again if it does.

**To compare with approach B (ticket 04)**

- A is a copy: the export and the install's app don't share history. B keeps one repo per app. Look at what each update shows in git and what happens to the owner's own edits.
- A carries the UI kit, theme and tsconfig in `shared/`, so the repo stands alone (install, lint, typecheck and test all pass). How big each repo is, and whether B's stands alone.
- Moving an app from install A to install B, step by step: TESTING.md here against B's.
- How each handles shared code that differs between installs: A keeps it inside the app, renamed.
- Both use the same manifest fields, contract version and seed, if B took them from this ticket.

**Weak spots**

- A deploy never runs the seed. Production's provision step makes the schema in core's container, which doesn't have the app's code, and the app's container only migrates. In production, an imported app starts empty. It's in the map's known gaps.
- Updating doesn't merge. An owner who edited an imported app loses those edits on update, unless they redo them from git diff.
- An app that keeps its own theme keeps the look of the install it came from.
- Until robkit's packages are on npm, an export from a linked install points at that install's checkout through `link:` overrides, so it installs on its own only on that machine. An install that has run `robkit vendor` puts the tarballs in the export instead. The sample guestbook carries no overrides, so for now it installs on its own only once the packages are published. Inside an install, which is how TESTING.md uses it, it works.
- Kept packages are renamed by rewriting quoted names in `.ts`, `.tsx`, `.js`, `.css`, `.json` and `.html` files, then formatting with prettier. A name built at runtime wouldn't be rewritten.
- Docker Compose names a project after its folder, so two installs both called `install-a` share a database. TESTING.md gives each a `COMPOSE_PROJECT_NAME`. Installs made elsewhere don't get one.
- On Windows, a few create-robkit tests time out at 5s under load, and the repo-checks catalog test fails even on the base commit. In WSL they pass.
