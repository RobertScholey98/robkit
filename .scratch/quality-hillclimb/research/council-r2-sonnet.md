# robkit quality report (reviewer: Sonnet 5.5)

Commit: f2a16c1. Scope: root config and docs, `.github/`, all of `packages/*/src` (core, create-robkit, dev, guard, hono, react, session, start), `tooling/eslint`, `tooling/repo-checks`, `tooling/typescript`, and a sample of `tooling/e2e`, `tooling/test-session` and `tooling/test-postgres`. I skimmed the create-robkit templates (they are an install's own files, lint-ignored by knip, checked by `robkit check`). I did not read `.scratch/quality-hillclimb/`, and I did not run Docker-backed suites.

## Scores

| # | Category | Score | One-line reason |
|---|----------|-------|-----------------|
| 1 | Module boundaries | 9 | A package graph file, a lint rule built from it, a repo check for cycles and a layer rule for installs; each package's index is small. |
| 2 | Public API design | 8 | Small, branded, type-tested APIs with generated reports; `@robkit/session` has six subpaths and the `read*` helpers return two different failure shapes. |
| 3 | Type safety at the edges | 9 | Zero `any`, zero `@ts-` directives, one `eslint-disable` in 13k lines; casts and `JSON.parse` casts fail lint; every env and body goes through a reader. |
| 4 | Naming and domain language | 9 | `GLOSSARY.md` is enforced by a repo check; file names match the concepts. |
| 5 | Simplicity | 8 | Few layers and 8 runtime dependencies in the published packages; heavy tooling surface and some duplication (`test/slug.ts` six times). |
| 6 | Consistency | 9 | One input convention, one problem type, one error convention, one test layout; each is lint-enforced. |
| 7 | Error handling | 8 | Expected failures are values, faults carry `cause`, CLI problems are separate; 48 `throw new Error` sites, some without a next step. |
| 8 | Testing | 9 | Public-interface tests, 6 `vi.*` uses in total, type tests, a real fake core, per-package coverage thresholds that can't drop, two e2e suites. |
| 9 | Keeping standards up | 9 | Eight custom lint rules with tests, API reports, doc-example compile check, glossary check, catalog check, changesets, commit and PR-ticket checks. |
| 10 | Nice to work in | 8 | Excellent root docs, per-package READMEs, ADRs, one-command setup; no READMEs under `tooling/`, and the full suite needs WSL and Docker. |

## Measurements

| Measure | Result | How |
|---|---|---|
| Gate | `pnpm check` passes: 44 turbo tasks, 43 cached; 22 s cached, about 34 s wall on Windows | Ran it after `pnpm install --frozen-lockfile` (7.7 s) |
| Source size | 144 non-test TS/JS files, 13,268 lines in `packages` and `tooling`, excluding templates | `git ls-files` + `wc` |
| Published packages | 8 (core, create-robkit, dev, guard, hono, react, session, start), 5 private tooling packages plus eslint, e2e | `pnpm-workspace.yaml` |
| Largest non-test files | `tooling/e2e/src/production-stack.ts` 540, `install-journeys.ts` 498, `session/src/request-guard.ts` 419, `create-robkit/src/coolify-deploy.ts` 369, `repo-checks/src/glossary.ts` 343 | `wc -l` |
| `any` in non-test source | 0 (one hit was the word "any" in a comment) | grep for `: any`, `as any`, `<any>` |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` in non-test source | 0 | grep |
| `eslint-disable` in non-test source | 1 (`packages/core/src/database.ts:11`, with a reason) | grep; lint also requires a reason and rejects unused ones (`tooling/eslint/index.js`) |
| Real `as` casts in non-test source | none found; `no-unsafe-type-assertion` is an error outside tests (`tooling/eslint/index.js`). 28 `as X` in tests | grep, then the lint config |
| `throw new Error` in non-test source | 48 sites, 2 custom classes (`CommandProblem`, `CoreUnreachableError`) | grep |
| `console.` in non-test source | 30 (CLI output and `reportToConsole`) | grep |
| Test files | 103 `*.test.*`, 18 `*.db.test.ts`, 6 `*.test-d.ts`, plus 9 lint-rule tests | `git ls-files` |
| Mocks | 6 `vi.fn`/`vi.mock`/`vi.spyOn` uses across all tests | grep |
| Coverage thresholds | per package in each `vitest.config.ts`; core is 96/95/91/97; CI fails a PR that lowers one | `check-coverage-thresholds.ts` in `ci.yml` |
| Custom ESLint rules | 6 (`core-schema`, `layer`, `no-json-cast`, `no-silent-catch`, `one-problem-type`, `relative-import-extension`) each with a `.test.js` | `tooling/eslint/` |
| Repo checks (run as tests) | api-report, catalog, commit subjects, coverage thresholds, doc examples, glossary, graph, manifest, package-scripts, PR ticket, problem checks, published, renovate: 122 tests, 15 files | `tooling/repo-checks/src` |
| Duplicate files | `test/slug.ts` identical in core, create-robkit, dev, hono, start and e2e; a different copy in session | `md5sum` |
| tsconfig strictness | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax`, `erasableSyntaxOnly` | `tooling/typescript/base.json` |
| ESLint preset | `strictTypeChecked` + `stylisticTypeChecked` | `tooling/eslint/index.js` |
| READMEs | 8 package READMEs (41 to 96 lines), root README, CONTRIBUTING (204), GLOSSARY (125), architecture (182), testing (49), 12 ADRs, 2 convention docs. None in `tooling/*` | `git ls-files` |

## 1. Module boundaries: 9/10

What they do well:
- The allowed dependency edges are data: `tooling/eslint/package-graph.js` lists which workspace package may depend on which. `tooling/repo-checks/src/graph-check.ts` (321 lines, 98% covered) fails on an unlisted edge, an unlisted import or a cycle.
- `tooling/eslint/layers.js` turns the graph into lint rows: `coreRows` emits one "never imports @robkit/core" row per package the graph keeps off core (lines 43 to 65), so a new package gets the rule without anyone remembering. The message names the rule.
- Framework-free packages are enforced, not described: session and guard may not import hono, react or tanstack (`frameworks` list in `layers.js`), and the guard may not use I/O globals (`globals` field in the row type).
- Entry files are tiny and readable: `packages/guard/src/index.ts` is 17 lines, `packages/hono/src/index.ts` 2 lines, `packages/core/src/index.ts` 7 lines. Dependency direction is documented in `AGENTS.md` and `docs/architecture.md` with a diagram, and ADR 0011 and 0012 say why.
- A published package's runtime code may import only its `dependencies` edges (`AGENTS.md`, enforced by graph-check).
- The same discipline reaches the generated install: `packages/create-robkit/src/check.ts` has one `LayerRow` per install rule and the install's `lint` script runs it. The e2e test confirms `pnpm lint` catches a cross-app import and that the pre-commit hook refuses it (`docs/testing.md`).
- Core's tables are fenced by `robkit/core-schema` (`tooling/eslint/core-schema.js`).

Weaknesses:
- `@robkit/session` is the hub of the graph and holds the token, the guard orchestration, addresses, input readers, manifest and report. It is cohesive but wide (six entry points, `packages/session/package.json` exports).
- Cross-package imports go through string subpaths such as `@robkit/session/input` that three packages use. The reader helpers could be their own tiny package.
- `request-guard.ts` is 419 lines with several concerns (cookies, refresh redirects, rule cache, fault reporting).

To raise this by one point:
- Split `packages/session/src/request-guard.ts` into the cache of access rules, the refresh/redirect logic and the decision function, each in its own file, so the 419-line file shrinks under about 200. Keep `requestGuard` as the only export in `index.ts`.
- Move `packages/session/src/input.ts` (and its readers) into a package of its own, listed in `tooling/eslint/package-graph.js`, so session's six subpaths drop to three and core, dev and create-robkit stop reaching into session for env parsing.

Worth copying into robkit: already done. Others should copy the data-driven package graph (`package-graph.js`) feeding both a lint rule and a repo check.

## 2. Public API design: 8/10

What they do well:
- `packages/*/api-report.md` is generated from the built declarations and compared in a test (`tooling/repo-checks/src/api-report.test.ts`, 8 packages pass), so any export change shows in review.
- Adapter packages export almost nothing: `@robkit/hono` exports `guarded` and re-exports `Viewer`; `packages/start/src/index.ts` is similar.
- Branded types stop mix-ups: `RoleId` and `CodeId` are `string & { readonly [brand]: true }` (`packages/guard/api-report.md`), minted only by `readRoleId`/`readCodeId`.
- Decisions are tagged unions (`Decision` with `outcome`), so callers must handle `login`, `refresh` and `not-found`.
- `*.test-d.ts` files say what must and must not compile for guard, hono, react, start and session (6 files); the adapters' `test` scripts run `vitest run --typecheck`.
- README per package lists exports and the layer rule; examples in docs are compiled by `doc-examples.ts`.
- `exports` maps use `publishConfig` to point at `dist`, and a repo check packs each package and fails on a non-JS export.

Weaknesses:
- `@robkit/guard` read helpers return `T | undefined` (`readAccessRule`, `readCodeId`), while `@robkit/session/input` readers return `T | InputProblem`. Two failure shapes for the same job, in the same public surface.
- `@robkit/session` has six entry points, and names such as `./lapsed` and `./addresses` don't match their files (`session-lapsed.ts`, `install-addresses.ts`).
- `@robkit/core` exports `registerApps`, `ensureSigningKey` and `migrate` beside `createApp`; it isn't clear from the entry file which are for an install's `apps/core/src/main.ts` and which are internals.
- Options such as `GuardedOptions.access?: AccessRule | undefined` are loose in the bound-or-not sense (documented, but still a required-reading doc comment).

To raise this by one point:
- Make `readAccessRule`, `readCodeId`, `readRoleId`, `readRoleIds` in `packages/guard/src/guard.ts` return `InputProblem` like the session readers (or document and lint why guard cannot depend on session). Update `packages/guard/api-report.md` and the callers in `packages/session/src/request-guard.ts`.
- Rename the session subpaths to their file names or the reverse (`./lapsed` to `./session-lapsed`, `./addresses` to `./install-addresses`) in `packages/session/package.json`, and add a one-line comment per export in `packages/session/README.md`.
- In `packages/core/src/index.ts`, add a README table saying which export is for the install's `main.ts` and mark the rest `@internal` or stop exporting them.

Worth copying into robkit: already done (generated API reports and type-level tests).

## 3. Type safety at the edges: 9/10

What they do well:
- The shared tsconfig is as strict as TypeScript gets: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`, `verbatimModuleSyntax` (`tooling/typescript/base.json`).
- Zero `any`, zero `@ts-*` directives, one lint suppression in non-test source (measurements).
- `typescript-eslint` `strictTypeChecked` plus `no-unsafe-type-assertion` as an error outside tests; `robkit/no-json-cast` closes the `JSON.parse(...) as T` and `.json() as T` gap that the first rule lets through (`tooling/eslint/index.js:40-56`, rule tested in `no-json-cast.test.js`).
- Input has one convention, `docs/conventions/input.md`: each reader in `packages/session/src/input.ts` returns a value or an `InputProblem`, and `allProblems` joins several so core refuses to start with every bad variable listed (`packages/core/src/env.ts:35-60`).
- `robkit/one-problem-type` forbids a private `{ error: string }` shape.
- Install addresses are branded (`Slug`, `Install`) and there is a `install-addresses.test-d.ts`.
- The conformance cases in `packages/guard/conformance.json` are parsed into types by `conformance.ts`, so the JSON fixtures are checked too.

Weaknesses:
- 28 casts remain in tests (allowed by design), and `as CodeId` in `guard.test.ts` bypasses the brand; fine for a test but unchecked.
- A few helper results are `unknown` that get narrowed by ad hoc `typeof` checks in create-robkit (`json.ts`, `choices.ts`) rather than a shared reader.
- DB rows from Drizzle are trusted as typed, which is normal, but no runtime check guards the stored JSON in the catalog columns.

To raise this by one point:
- Replace the ad hoc `isRecord`/`typeof` narrowing in `packages/create-robkit/src/json.ts`, `choices.ts` and `vendor.ts` with the `input.ts` readers, and add a lint check or knip rule that bans `typeof x === "object"` outside `packages/session/src/input.ts`.
- Add a brand-minting test helper in `tooling/test-session/src/index.ts` (`aCodeId()`), and stop using `as CodeId` in `packages/guard/src/guard.test.ts:22`.

Worth copying into robkit: already done. The `no-json-cast` rule is the part to copy elsewhere.

## 4. Naming and domain language: 9/10

What they do well:
- `GLOSSARY.md` (125 lines) defines install, core, hub, admin, guard, viewer, app token, access code, role, slug. `tooling/repo-checks/src/glossary.ts` (343 lines) fails the build on words the glossary says to avoid, and each exception has a reason.
- File names match concepts: `access-codes.ts`, `session-token.ts`, `request-guard.ts`, `install-addresses.ts`, `launcher.db.test.ts`, `guest-sessions.db.test.ts`. A newcomer can guess most of them.
- Tests named `*.db.test.ts` run in a separate project; the convention is enforced by `package-scripts.ts`.
- Docs, code, tickets and ADRs use the same words; ADR titles are the decision ("core signs, apps verify").

Weaknesses:
- Some names carry two concepts: "session" means the viewer's session token, the guard's `SessionState`, and the `sessions.ts` store in core; "guarded" is both a function name in three adapters and a concept.
- Subpath names that don't match files (see category 2).
- `packages/create-robkit` holds three tools (`create-robkit`, `robkit`, `robkit-dev` wrappers) under one package name, so `robkit.ts` in `create-robkit/src` surprises a newcomer.

To raise this by one point:
- Add "session token", "session state" and "session" (the core row) as separate glossary entries in `GLOSSARY.md` and rename `packages/core/src/sessions.ts` to `session-store.ts`, with the glossary check covering the avoid-list for bare "session".
- Rename `packages/create-robkit/src/robkit.ts` to `robkit-command.ts` (and `bin.ts` to `create-robkit-command.ts`) so the three commands' files read alike.

Worth copying into robkit: already done. The enforced glossary is the practice to copy elsewhere.

## 5. Simplicity: 8/10

What they do well:
- Few layers: a feature such as access codes is `access-codes.ts` (197 lines), `routes/codes.ts`, `schema.ts`, and tests. Tracing takes three files.
- Dependencies are modest: 7 package manifests list runtime dependencies; the catalog is about 45 entries including dev tools (`pnpm-workspace.yaml`). `knip` is in the gate (`package.json` `check`), so unused exports and dependencies fail.
- Largest runtime file is 419 lines; most are under 200.
- `ignoreExportsUsedInFile` and a README rule per package keep export lists short.
- Docs say "pure guard, thin adapters" (ADR 0011) and the code matches: hono and start adapters are single files.

Weaknesses:
- The tooling surface is large for 13k lines: 6 lint rules, 15 repo-check modules and 5 private packages. The machinery is good but a reader has to learn it.
- `test/slug.ts` is copied into six packages unchanged (`md5sum`), with a seventh differing copy in session: a shared helper would be one file.
- `tooling/e2e/src/production-stack.ts` (540) and `install-journeys.ts` (498) are long scripts that mix setup, journeys and checks.
- Two near-parallel layer-rule implementations (`tooling/eslint/layers.js` for the repo, `packages/create-robkit/src/check.ts` for installs) both with row tables.
- Templates carry a full install (hub, admin, two stacks), so the kit's size is partly hidden under `templates/`.

To raise this by one point:
- Delete the six `src/test/slug.ts` copies and put `slug()` in `tooling/test-session` (already a devDependency of the packages that use it); update the imports in the test files and the graph entry if needed.
- Split `tooling/e2e/src/production-stack.ts` into stack setup and the journey, and `install-journeys.ts` into one file per journey that `owner-journey.ts` and friends already model.

Worth copying into robkit: already done. Others should copy the knip-in-the-gate habit.

## 6. Consistency: 9/10

What they do well:
- One input convention (`docs/conventions/input.md`), one error convention (`docs/conventions/errors.md`), one problem type (`one-problem-type` rule), one report function (`reportToConsole`), one CLI runner (`runCommand` in `@robkit/dev/cli`).
- Every package has the same files: `README.md`, `api-report.md`, `eslint.config.js`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts`. `package-scripts.ts` fails when a package misses a script, and its exceptions list gives reasons.
- Relative imports always use `.ts` (rule `relative-import-extension`).
- Every version comes from the pnpm catalog with `catalogMode: strict`, plus a test in `catalog.ts`.
- Tests sit next to their source; `*.db.test.ts` and `*.test-d.ts` suffixes mean the same everywhere.
- Doc comments on exports follow one style ("`value` as a role id, if it is..."). Core routes in `packages/core/src/routes/*.ts` all look the same.

Weaknesses:
- Console output: 30 `console.` calls in source across CLI code with no single logger wrapper, though CLI code is the only place.
- Some config readers return `InputProblem` (core) while create-robkit's `json.ts` throws a plain `Error` with the problem's text (lines 9 to 11), so two shapes for one job.
- Packages with the same job differ slightly (`packages/hono` and `packages/start` each own a `guarded.ts` with similar structure but different option names).

To raise this by one point:
- Make `packages/create-robkit/src/json.ts:9` and `vendor.ts:21` throw `CommandProblem` (or return the `InputProblem`) instead of `new Error(parsed.error)`, then extend `robkit/one-problem-type` to flag `throw new Error(<problem>.error)`.
- Give the CLI packages one `print()` helper in `packages/dev/src/cli.ts` and lint `console.` outside it and `report.ts`.

Worth copying into robkit: already done.

## 7. Error handling: 8/10

What they do well:
- The model is written down and enforced: expected failures are values, faults throw with `cause`, boundaries convert both (`docs/conventions/errors.md`). `preserve-caught-error` and `robkit/no-silent-catch` (with tests) block swallowed errors (`tooling/eslint/index.js`).
- The guard answers 503, not "signed out", when it can't check a request, and hands `GuardFault { app, failed, cause }` to `onUnavailable` (`packages/session/src/request-guard.ts:38-80`).
- Core's single `app.onError` assigns a request id, logs the cause and answers a generic 500 with `requestId` and `X-Request-Id`.
- User-facing messages say what to do next: "Set COOLIFY_TOKEN to deploy." style in `env.ts`, `coolify-config.ts:70` ("Set it to the domain the install answers on alone, such as robkit.dev."), `apps.ts:61` (shows a sample value).
- `CommandProblem` prints without a stack; anything else prints as a bug with where to report it.
- Every outbound request has a timeout (a stated convention).

Weaknesses:
- 48 `throw new Error(...)` in non-test source; some are bare statements without a fix: `packages/core/src/sessions.ts:117` "Core couldn't store the session.", `owner.ts:71`, `signing-key.ts:60`, `access-codes.ts:169`. They are faults, so a stack is right, but they carry no `cause` or detail (the insert returned nothing).
- `packages/create-robkit/scripts/shadcn-kit.ts:61` "shadcn ... failed" names the command but not the exit code or next step.
- Errors are not tagged with a code, so callers outside robkit's own can only switch on message or class; only two error classes exist.
- `no-silent-catch` is lint, but there is no check that the fault-throwing sites keep the context the doc says they should.

To raise this by one point:
- In `packages/core/src/sessions.ts:117`, `owner.ts:71`, `signing-key.ts:60` and `access-codes.ts:169`, include what was attempted (table, key, attempt count) in the message, and add a `FaultError` class in `@robkit/session` with a `what` field so tests can assert on it.
- Fix `packages/create-robkit/scripts/shadcn-kit.ts:61` and `packages/create-robkit/src/vendor.ts:85` to say the exit code, the folder and the fix, as `docs/conventions/errors.md` asks of commands.
- Add a lint rule `robkit/no-bare-error` that fails a `throw new Error("...")` whose message has no interpolation and no `cause`, with an allow-list in the rule's tests.

Worth copying into robkit: already done. The guard's 503-not-signed-out rule is a good example of an explicit failure.

## 8. Testing: 9/10

What they do well:
- Tests call public interfaces. `packages/session/src/request-guard.test.ts` drives `requestGuard` against a `fakeCore` from `@internal/test-session` and asserts on responses, cookies and redirects, not on internals.
- Almost no mocking: 6 `vi.*` calls across 103 test files. The suite uses a real fake HTTP core (`tooling/test-session`) and real Postgres per suite (`tooling/test-postgres`).
- A shared conformance suite (`packages/guard/conformance.json`) is run by the guard and by `requestGuard` tests, so the pure guard and its adapter are checked against one table.
- Type-level tests (6 `*.test-d.ts`) run through `vitest run --typecheck`.
- Lint rules and repo checks are themselves tested (`tooling/eslint/*.test.js`, 15 repo-check test files with 122 tests).
- Fast split: `test:unit` (no Docker) runs in `pnpm check`; `*.db.test.ts` runs in a separate `db` project. `pnpm check` ran green on Windows in about 34 s.
- Per-package coverage thresholds, with a CI check that a PR cannot lower them (`check-coverage-thresholds.ts`). Core is 96/95/91/97.
- Whole-stack end-to-end: `tooling/e2e` generates installs on both stacks, adds an app, drives Chromium through owner, guest, role and theme journeys, runs axe, and a production test deploys images behind Caddy over https.
- Cleanup is engineered: a detached watcher removes test containers however the run ends (`docs/testing.md`).

Weaknesses:
- I could not run `.db.test.ts` or e2e here (Docker, Linux), so their speed and flakiness are unverified. CI pairs them with `COMPOSE_FILE` workarounds for `ERR_NETWORK_CHANGED`, which shows the e2e is sensitive to the host.
- Three check wrappers (`check-commit-subjects.ts`, `check-coverage-thresholds.ts`, `check-pr-ticket.ts`) show 0% coverage in the report; their logic lives in tested modules, but the entry glue is not tested.
- `request-guard.test.ts` imports a `slug` helper and a lot of fixtures; the setup is heavy for a reader.
- A few tests use `as CodeId` or `as unknown as` style casts to build fixtures.

To raise this by one point:
- Add a test per CLI wrapper in `tooling/repo-checks/src/` (`check-commit-subjects.ts`, `check-coverage-thresholds.ts`, `check-pr-ticket.ts`) that runs it as a child process with a good and a bad input and asserts exit code and message.
- Add a small `tooling/test-session` builder (`aViewer({ kind: "guest", roles })`) so `packages/guard/src/guard.test.ts` and `request-guard.test.ts` don't cast to brands.
- Publish the e2e run time and flake count in CI (the job already uploads coverage; add timing to the summary) so a slow e2e shows up.

Worth copying into robkit: already done. The shared conformance JSON between the pure function and its adapter is a pattern others should copy.

## 9. Keeping standards up: 9/10

What they do well:
- The custom lint rules in `tooling/eslint/` (layer, core-schema, no-json-cast, no-silent-catch, one-problem-type, relative-import-extension) each carry the rule's name in the message and have their own tests. `AGENTS.md` says a new rule ships with its lint rule in the same commit.
- Repo checks run as ordinary tests, so `pnpm check` runs them: API reports match built declarations, every docs `ts` fence compiles against built packages (`doc-examples.ts`), glossary avoid-words, catalog-only versions, package scripts, published tarball exports, Renovate config.
- CI (`.github/workflows/ci.yml`): `pnpm check:all` on every PR and push, then a `pull-request` job that checks every commit subject, coverage thresholds against the base, `changeset status`, and that the PR body names an existing ticket file. One required `gate` job collects them and treats a skipped job as failure on PRs.
- Production test runs nightly and on main (`nightly.yml`, `production.yml`).
- `.husky/pre-commit` runs lint-staged (ESLint fix + Prettier); `.husky/commit-msg` checks the subject.
- `knip` for unused code; `reportUnusedDisableDirectives: "error"` and the `eslint-comments` plugin require a reason for each suppression.
- Changesets (`.changeset/config.json`) with `changedFilePatterns` that exclude tests.
- `CODEOWNERS`, a PR template, Renovate, `AGENTS.md` and `CLAUDE.md` for AI contributors, and the generated install carries its own AGENTS.md, CI workflow and hooks.
- `robkit check` ships the install's layer rule to users, so the standard travels with the generated code.

Weaknesses:
- Several rules exist only as prose in `AGENTS.md`: "tests go with the behaviour they cover", "refactors get their own commit", "one logical change per commit". Only the subject line is machine-checked.
- Coverage thresholds are hand-set per package; there is no ratchet that raises them automatically.
- `CODEOWNERS` has one owner, so it enforces nothing beyond a name.
- No type-level test for core or create-robkit's public types, and `e2e` has no coverage thresholds by design.
- The CI check on commits runs only on PRs; a direct push to main skips them (branch protection isn't visible from the repo).

To raise this by one point:
- Add a `check-coverage-thresholds` mode that fails when measured coverage exceeds a package's thresholds by more than 2 points ("raise them"), in `tooling/repo-checks/src/coverage-thresholds.ts`, so thresholds ratchet up.
- Add a repo check that a commit touching `packages/*/src/*.ts` (non-test) also touches a test file in the same commit, as `CLAUDE.md` states, in `tooling/repo-checks/src/check-commit-subjects.ts` (or a sibling).
- Add `*.test-d.ts` files for `@robkit/core` and `create-robkit` exports and extend the `AGENTS.md` rule to every published package.

Worth copying into robkit: already done. The "one required gate job that fails on skipped" pattern in `ci.yml` is the part to copy elsewhere.

## 10. Nice to work in as a human: 8/10

What they do well:
- Root `README.md`, `CONTRIBUTING.md` (204 lines: prerequisites, WSL steps, set up, gate table with time and Docker need, a worked first change, branches and commits), `docs/architecture.md` (mermaid flow and sequence diagrams, package map), `docs/testing.md` (what each suite prints when it fails), 12 ADRs each linking its ticket.
- Each package README says its purpose, an example, its exports and its layer rule; core, create-robkit, dev, guard and session end with "For contributors".
- One-command setup: `pnpm install`, then `pnpm check`; `pnpm create-install` makes a linked install to try changes the way a user would.
- Dev loop: `pnpm check` is about 34 s on Windows without Docker, with turbo caching (43 of 44 cached on rerun).
- Comments explain why (for example `ci.yml` on `COMPOSE_FILE` and `ERR_NETWORK_CHANGED`; `knip.jsonc` on every ignore).
- Lint error messages name the rule and tell the contributor what to do. Doc-example failures "name the file and line of an example that doesn't compile, and how to mark a fragment".
- Tickets in `.scratch/` with a map linking every decision; skills copied into `.skills/` with licences.
- The PR template and CODEOWNERS are present.

Weaknesses:
- `tooling/*` has no READMEs (eslint, repo-checks, e2e, test-session, test-postgres); a contributor who hits a repo-check failure has to read the source to learn what the others check. `AGENTS.md` summarises them in a paragraph.
- The full suite needs Linux, Docker and WSL on Windows, so Windows contributors get only the fast gate.
- `.scratch/` planning (about 100 files) sits in the repo root and takes up the first screen of `git ls-files`; a newcomer must learn to ignore it.
- No `examples/` or playground other than `create-install`; the generated install is the demo.
- The AGENTS.md convention list is dense (about 20 bullets), reading like a rulebook rather than a map.

To raise this by one point:
- Add `tooling/eslint/README.md` (each rule, its message, how to add a row to `package-graph.js` and `layers.js`) and `tooling/repo-checks/README.md` (a table of each check, what it fails on, how to fix or add an exception). Link both from `CONTRIBUTING.md`.
- Move `.scratch/` planning behind a single `docs/planning.md` pointer in `CONTRIBUTING.md`, and say there which ticket status to pick up, so a first-time contributor doesn't need `CLAUDE.md`.
- Add a short "Troubleshooting" table to `CONTRIBUTING.md` for the three failures a new contributor will meet (pnpm shim on Windows, Docker credential helper, `ERR_NETWORK_CHANGED`).

Worth copying into robkit: already done. Others should copy the gate table in `CONTRIBUTING.md` (command, what it runs, needs Docker, time).

## Top 5 practices to copy

1. Data-driven package graph feeding both lint and a repo check: `tooling/eslint/package-graph.js`, `tooling/eslint/layers.js` (`coreRows`), `tooling/repo-checks/src/graph-check.ts`.
2. Repo checks written as tests, so the fast gate enforces docs and metadata: `tooling/repo-checks/src/doc-examples.ts` (docs compile), `api-report.ts` (generated API reports), `glossary.ts`, `catalog.ts`.
3. Custom lint rules for the bugs the stock rules miss, each with a test and a message that names the rule: `tooling/eslint/no-json-cast.js`, `no-silent-catch.js`, `one-problem-type.js`.
4. One `gate` job that fails on any skipped or failed job, with PR-only checks for commit subjects, lowered coverage thresholds, changesets and ticket links: `.github/workflows/ci.yml`.
5. A shared conformance table that the pure function and its adapter both run: `packages/guard/conformance.json`, `packages/guard/src/guard.test.ts`, `packages/session/src/request-guard.test.ts`.
