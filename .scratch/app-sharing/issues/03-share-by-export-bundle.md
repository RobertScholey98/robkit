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
- [x] `pnpm robkit update <slug>` brings an imported app up to the newest export, keeping the owner's edits, its schema and data, and never re-running its seed (round two)
- [x] A deploy seeds an app's new schema once, as `pnpm dev` does (round two)
- [x] Two installs never share a Postgres by accident, and a `seed.sql` at the app's root is its seed with no manifest field (round two)

**Answered (R, 2026-11-05):** R leans toward this approach. Schema plus an optional seed travels, never data.

Source: [App sharing PRD](../PRD.md)

## Comments

**Choices, and why**

- The manifest is the `robkit` field of the app's `package.json`, as before. It gains `name`, `stack`, `description` and `contract`, beside `access` and `icon`. `robkit add` and the example write `name`, `stack` and `contract`. One file stays the app's one manifest.
- The contract version is 1, in create-robkit's `src/contract.ts`. An install runs the contracts its create-robkit lists in `runsContracts`, so a newer robkit can list 1 and 2 and still import old exports.
- The seed is `seed.sql` at the app's root, run as the app's own role. (Round two: it was a file the manifest named as `robkit.seed`, but it only ever had one sensible name, so the field went.) When the provision step makes an app's schema, it marks it with the comment `robkit: seed pending`. The seed and the clearing of that mark run in one transaction, after migrations. So a failed migrate or a failed seed retries on the next run, and a schema that existed before never seeds. SQL keeps it stack-agnostic: no stack code runs. `pnpm dev` prints `[<slug>] ran seed.sql once, on its new schema` when it runs one.
- The export is a pnpm workspace: the app at the root and each shared package under `shared/<folder>`, with their package names unchanged. So the app's imports need no rewriting on export, and import only rewrites what it keeps.
- `shared/` is found from the manifest's `workspace:` dependencies and from the imports `robkit check` already reads, so a stack's file layout doesn't matter. An import of a workspace package the manifest doesn't list gets added as `workspace:*`.
- The export adds what it needs to stand alone: `packageManager`, a `lint` script with ESLint, and a `test` script with Vitest (plus a `vitest.config.ts` with `passWithNoTests` if the app has none). Repo-only files (`README.md`, `eslint.config.js`, `.gitignore`, the `pnpm-workspace.yaml` comment) begin with "Written by robkit export.", and import leaves them out. Import also always leaves out `pnpm-workspace.yaml`, `pnpm-lock.yaml` and `vendor/robkit/`.
- Import maps a `shared/` package back onto the install's own when every file is byte for byte the same, and its `package.json` is the same once versions go back into the catalog. A package is mapped only if everything it depends on in `shared/` is mapped too. A package that differs stays in the app as `apps/<slug>/shared/<folder>`, renamed `@internal/<slug>-<folder>`, and the install's workspace gains `apps/*/shared/*`. Exporting that app again copies its kept packages as they are.
- A version the catalog has goes back to `catalog:`. A new one is added to the catalog, and a different one keeps the catalog's version, and import says so.
- Updating is `pnpm robkit update <slug>` (round two). Import records the source in the app's manifest as `robkit.imported`: the folder or git URL, and the commit when the source was a clean git repository. Update fetches the source again and merges three ways: the app as the owner has it, the recorded commit as import would write it now, and the new export as import would write it. A file only one side changed takes that side's version, removals included; a file both changed merges with `git merge-file`, with git's conflict markers where they meet, and the command exits 1 and names the files. The schema and data stay, and the seed doesn't run again, since update writes files only. This is the full merge, not the refuse-if-edited minimum.
- A local path imports the folder as it is, uncommitted changes included. A git URL is cloned with `--depth 1`.
- The slug comes from the package name `@internal/<slug>-app`, which both robkit add and the export keep. `--as` overrides it.
- Export refuses an app that breaks the layer rule, and import removes the app again if it does.

**Round two (2026-11-05, decided while R slept)**

- Each install gets its own Compose project: init writes `compose.yaml`'s top-level `name:` as the folder's name, as Compose spells it, plus six random hex characters, fixed at init. A `name:` in the file beats the folder's name, and `-p` and `COMPOSE_PROJECT_NAME` still beat it, so the tests' own project names still win. The generator takes the name as `project`, and its snapshot tests pin one.
- The manifest field `robkit.seed` went: a `seed.sql` at the app's root is the seed. One file name is one less thing to type and to get wrong.
- Update's record lives in the app's manifest rather than in `robkit.json`, so removing the app removes its record and `--as` needs nothing extra. Export drops it, since it means nothing to the next install.
- Update's base is the recorded commit imported again into today's install, not a stored copy. So a catalog or shared package that changed in the install since the import moves the base too, and the merge sees only the export's own changes. It needs the source's history: an export repo keeps it, and a git URL is cloned in full for an update.
- Without a recorded commit (a folder with uncommitted changes, or a copy outside git), update refuses and points at `--force`. A lockfile from installing the export on its own doesn't count as uncommitted, since import leaves it out.
- Seeds in production: each stack's `start` script runs `robkit-seed` between migrating and serving. It's a bin of `@robkit/dev` that runs the same `seedOnce` as `pnpm dev`, as the app's role, from the app's folder. Production's provision step can't do it itself: it runs in core's container before the app has migrated, and core's image hasn't the app's code. So apps take `@robkit/dev` as a production dependency. A stack added later needs `robkit-seed` in its `start` script too.
- Export still copies `shared/`, even when it matches every install's: without it the repo doesn't install, lint, typecheck or test on its own. Import drops the copies that match, so they cost nothing in the install.
- TESTING.md dropped the hand-written `COMPOSE_PROJECT_NAME`, `npm pkg set robkit.seed`, the look round the export and its standalone install, lint, typecheck and test (the sharing test checks them), the `psql` check (`pnpm dev` now says it seeded), the import refusal, and the remove-and-import update. It uses `pnpm` rather than `corepack pnpm`, since R's WSL has the Corepack shim on its path. Its commands went from 63 lines to 49, and the update round is new among them.
- The Postgres and proxy ports stay fixed at 54320 and 3000 rather than picked per install. A second install's `pnpm dev` fails on the taken port, which is loud and safe, and a picked port would mean URLs that change from install to install. `ROBKIT_DEV_PORT` and `ROBKIT_POSTGRES_PORT` still move them.
- TESTING.md ran verbatim in WSL from a clean slate, with the browser steps scripted in Playwright, on ports 3100 and 54420 so approach B's runs alongside couldn't take them. The first run failed when another install held port 54320 for a moment.

**To compare with approach B (ticket 04)**

- A is a copy: the export and the install's app don't share history. B keeps one repo per app. Look at what each update shows in git and what happens to the owner's own edits.
- A carries the UI kit, theme and tsconfig in `shared/`, so the repo stands alone (install, lint, typecheck and test all pass). How big each repo is, and whether B's stands alone.
- Moving an app from install A to install B, step by step: TESTING.md here against B's.
- How each handles shared code that differs between installs: A keeps it inside the app, renamed.
- Both use the same manifest fields, contract version and seed, if B took them from this ticket.

**Weak spots**

- Update needs the commit its import recorded. An app imported from a folder with uncommitted changes, or from a copy outside git, updates only with `--force`, which drops the owner's edits.
- An app that keeps its own theme keeps the look of the install it came from.
- Until robkit's packages are on npm, an export from a linked install points at that install's checkout through `link:` overrides, so it installs on its own only on that machine. An install that has run `robkit vendor` puts the tarballs in the export instead. The sample guestbook carries no overrides, so for now it installs on its own only once the packages are published. Inside an install, which is how TESTING.md uses it, it works.
- Kept packages are renamed by rewriting quoted names in `.ts`, `.tsx`, `.js`, `.css`, `.json` and `.html` files, then formatting with prettier. A name built at runtime wouldn't be rewritten.
- Two installs still can't run `pnpm dev` at once: both publish Postgres on port 54320 and the proxy on port 3000. They fail loudly rather than share a database.
- A schema a deploy made before `robkit-seed` existed still waits for its seed, so a `seed.sql` added to that app later runs on its next start.
- Update merges text line by line. A file git can't merge, such as an image, keeps the owner's version and is named as a conflict.
- On Windows, a few create-robkit tests time out at 5s under load, and the repo-checks catalog test fails even on the base commit. In WSL they pass.
