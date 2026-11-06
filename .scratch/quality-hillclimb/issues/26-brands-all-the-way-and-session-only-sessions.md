# 26: Brands all the way through, and session holds only sessions

**What to build:** A value that has been read keeps its brand until the code that uses it. `@robkit/session` holds sessions and nothing else, and one word names each concept.

Today:
- `createApp` and `InstallOptions` take `domain: string`, so the `Domain` brand is lost after env parsing.
- Core passes slugs around as plain `string`.
- `InputProblem` is structural, so any `{ error }` passes `isProblem`.
- `@robkit/session` still holds the install address helpers and `Report`, so dev and create-robkit depend on session for those alone.
- `@robkit/input` exports 33 declarations from one entry.
- The glossary's "Manifest" is `AppManifest`, `AppDeclaration` and `DeclaredApp` in code.
- `Database extends Connection {}` needs a lint disable.

Raises rubric categories 2 (public API), 1 (module boundaries), 3 (type safety) and 4 (naming). Evidence: `../research/council-r3-opus.md` sections 1 to 4; `../research/council-r3-sol.md` section 2; `../research/council-r3-sonnet.md` section 2.

- **`Domain` and `Slug` through core.**
  - `CoreOptions.domain` in `packages/core/src/app.ts`, and `InstallOptions` in session's addresses, take `Domain`. Thread it through `access-codes.ts`. Add `packages/core/src/app.test-d.ts` with `@ts-expect-error` on a plain string.
  - Core reads the slug at its route boundary with `readSlug` and answers 404 on a problem. `accessOf` and `setAccess` take `Slug`.
- **A nominal `InputProblem`.** It has a `unique symbol` property, readers build one only through a `problem(message)` helper, and `isProblem` checks the symbol.
- **Session holds only sessions.** Move `addresses.ts` and `report.ts` out of session, into `@robkit/input` or a new zero-dependency package; record which and why in Comments. Drop the dev-to-session and create-robkit-to-session edges in `package-graph.js` where nothing else needs them.
- **Input's entry.** Move the manifest format to an `@robkit/input/manifest` subpath, so the root is the reading primitives.
- **One word for the manifest.** Rename `AppDeclaration`, `readAppDeclaration` and `appDeclarationJson` to `AppManifest`, `readAppManifest` and `appManifestJson`, and fold dev's file-level type into input's or name it to match. Add "declaration" to the Manifest entry's Avoid list. You own `GLOSSARY.md` this round.
- **`Database`.** Make it a branded alias or a plain alias without the lint disable.
- **Commits and docs.** Renames and moves go in their own commits. Update the API reports and add changesets. Make the README import changes your moves force, and list other doc edits for ticket 25.

**Blocked by:** none

**Status:** done

- [x] Core and the address helpers take `Domain`, and core's access functions take `Slug`, with type tests
- [x] `InputProblem` is nominal, and only `problem()` makes one
- [x] Session holds sessions only, and the graph lost the edges nothing needs
- [x] The manifest has one name and its own subpath
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

- **The addresses and `Report` went into `@robkit/input`, as subpaths:** `@robkit/input/addresses` and `@robkit/input/report`. The addresses import only input's brands (`Slug`, `Domain`, `CoreOrigin`), so a new zero-dependency package couldn't hold them without depending on input anyway. Input already imports nothing and is where the brands live. `reportToConsole` prints, like `orExit`, so input's README now names both as its only I/O.
- **Edges.** Dev no longer depends on session. The whole-stack test lost its session edge too: it imported session only for the addresses, and knip then flagged it. create-robkit keeps its session edge, because `robkit check` takes `sessionCookie` from session to refuse an app that reads the cookie; `package-graph.js` now says so.
- **Input's root** holds the reading primitives. The manifest format is `@robkit/input/manifest`.
- **Names.** Input's types are `AppManifest`, `readAppManifest`, `appManifestJson`, `ManifestAccess`, and `ListedApp` with `readListedApp` for an app as `ROBKIT_APPS` lists it. Core's `readDeclaredApps` is `readListedApps`. Dev's whole-`package.json` type couldn't fold into input's, since it also holds the name and scripts, so it is `AppManifestFile`, from `appManifestFileIn` and `readAppManifestFile`. Its `declares` field, and an `App`'s, is `manifest`. The glossary's Manifest entry avoids "declaration", and its definition no longer uses the word.
- **`InputProblem`** carries a `unique symbol`, `Symbol.for("@robkit/input.InputProblem")`, so a problem made by one copy of input still passes another copy's `isProblem`. The mark doesn't enumerate, so a problem still prints, compares in `toEqual` and serialises as `{ error }`, and no test that compares one needed to change. The types do the enforcing: a `{ error }` literal no longer compiles as an `InputProblem`. A type-aware codemod turned every reader's literal into `problem(...)`.
- **`Domain`.** `isDomain` now narrows to `Domain`, beside `readDomain`, so `installAt` can check the name after the app's label. `installAt` now finds no install when that name isn't a domain, such as `core.robkit_dev`. `defaultDomain` is a `Domain`. `coreInstall` reads its domain with `readDomain`, which can't fail after `readCoreUrl`, so there is no unreachable throw to cover. Tests build one with a new `aDomain` builder in `@internal/test-session`.
- **Slugs in core.** Both `/apps/:slug/access` routes read the slug with `readSlug` and answer 404 on a problem, before touching the database.
- **`Database`** is a plain alias, `ReturnType<typeof connect>`. The API report prints it as briefly as the interface did, with no lint disable.
- **Session's coverage.** Its branches fell under the 93% threshold once the well-covered addresses left, so the Report commit adds a real test: `loopbackFetch` leaves a name outside localhost to `fetch`. CI then measured 98.09% of statements, and the ratchet asked for the statements threshold to rise from 96 to 98.

### Proof

- New tests failed first: `problem.test.ts` (an object with an `error` field isn't a problem; parsed JSON with one isn't either), `problem.test-d.ts`, `addresses.test-d.ts` and `core/src/app.test-d.ts` (a plain string isn't a `Domain`; the `@ts-expect-error` lines go unused on the old types), `addresses.test.ts` (`core.robkit_dev` finds no install), and `core/src/routes/apps.test.ts` (a name that can't be a slug got 500 from an unreachable database; it now gets 404 without asking).
- `pnpm check` passes on Windows: 48 of 48 tasks.
- In WSL with Docker, `pnpm --filter @robkit/core --filter @robkit/dev test` passes with coverage thresholds met: core 329 tests in 28 files, dev 75 tests in 9 files.
- CI's `gate` job passes: [run 42194275685](https://github.com/RobertScholey98/robkit/actions/runs/42194275685). The first run failed only the coverage ratchet: session measured 98.09% of statements against a threshold of 96, so the last commit raises it to 98.

### What I couldn't verify

- The whole-stack and production tests ran only in CI, not locally.

### For other tickets

- **Ticket 21 or 25, docs:**
  - `docs/conventions/errors.md`: "`Report` in `@robkit/session`" is now in `@robkit/input/report`.
  - `docs/conventions/input.md`: `InputProblem`'s shape now has the mark, and `problem(message)` is its only maker. The brand table's `Domain` is made by `readDomain` and `isDomain`, and `createApp` and `install` take one. The list of what `@robkit/input` holds should say the manifest format, the addresses and `Report` are subpaths.
  - `docs/architecture.md`: the addresses row is `packages/input/src/addresses.ts` (`@robkit/input/addresses`), and the manifest row is `@robkit/input/manifest`.
  - `AGENTS.md` and `tooling/eslint/README.md`: the test builders now include `aDomain`. AGENTS.md's "A failed read is an `InputProblem`" line can name `problem()`.
- **Ticket 21, templates:** the hub's and admin's `package.json` still list `@robkit/session`, which they no longer import. I changed only their imports.
- **Ticket 22, create-robkit's tests:** I changed `deployment.test.ts`, `coolify-config.test.ts` and `coolify-deploy.test.ts` to build domains with `aDomain`, and the generator snapshot's hashes for `apps/admin/src/client/codes-api.ts` and `apps/hub/src/core-origin.ts`. `check.test.ts` still uses `"@robkit/session/addresses"` as sample import text; it still passes, but `@robkit/input/addresses` would match today's packages.
- **Ticket 24, repo checks:** `tooling/repo-checks/src/manifest.ts`, `coverage-thresholds.ts` and `task-times.ts` now build problems with `problem()`, and a comment in `doc-examples.ts` names `@robkit/input/addresses`.
- `CONTRIBUTING.md`'s first-change example now builds its problem with `problem()`, since the old literal no longer compiles and the doc-examples check would fail.
