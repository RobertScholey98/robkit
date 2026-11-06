# robkit quality report (council round 3, Sonnet 5.5)

Commit: 16a7a7b (branch 56-round-3). Scope: root config and docs, `tooling/eslint` (config and rule list), `tooling/repo-checks` (file list, READMEs), `.github/` workflows, `packages/input|guard|session|hono|react|start` entry points and exports, samples from `packages/core` (`apps.ts`, `database.ts`, `session-store.ts`, `routes/session.ts`), `packages/create-robkit` (`coolify-deploy.ts`, `wizard.ts`), docs (`docs/architecture.md`, `docs/conventions/errors.md`, `docs/testing.md`, CONTRIBUTING). Skipped: `.scratch/quality-hillclimb/`, the template apps' internals, the e2e journeys' bodies, Docker-backed suites.

## Scores

| # | Category | Score | One-line reason |
|---|----------|-------|-----------------|
| 1 | Module boundaries | 9 | A package graph file, a repo check and a lint rule all enforce one-way layers; create-robkit is a large grab bag and exports point at `src`. |
| 2 | Public API design | 8 | Small entries, API reports and type tests; `@robkit/input` still exports about 30 names and some are loosely typed (`unknown[]` readers). |
| 3 | Type safety at the edges | 9 | Max-strict tsconfig, zero `any` and zero `@ts-ignore` in source, brand-cast and JSON-cast lint rules; a few hand-written `unknown` readers remain. |
| 4 | Naming and domain language | 9 | `GLOSSARY.md` is enforced by a repo check; a few overloaded words (install, app, profile vs viewer). |
| 5 | Simplicity | 7 | Few runtime dependencies and small files, but 15 workspace packages and about 20 repo checks is a lot of machinery for the code size. |
| 6 | Consistency | 9 | Errors, input reading, imports, scripts and coverage all follow one pattern, mostly by rule; CLI output uses `console.log` in places and an injected `log` in one. |
| 7 | Error handling | 9 | Expected failures are tagged unions, faults carry `cause`, lint bans silent catch and bare errors; some plain-string throws and hand-built `{ error }` objects remain. |
| 8 | Testing | 8 | Behaviour tests through public interfaces, type-level tests and a whole-stack browser test; create-robkit's unit coverage is 73% (`wizard.ts` 26%) and `pnpm check` skips the DB suites. |
| 9 | Keeping standards up | 9 | I proved the lint rules fail on bad code; CI, ratchet, changesets, API reports and PR-ticket checks exist. Gaps: a one-person CODEOWNERS and no visible branch-protection or review bot. |
| 10 | Nice to work in as a human | 8 | Strong per-package READMEs, ADRs, CONTRIBUTING and a one-command install generator; the full suite needs WSL and Docker, and the repo's size makes the day-one path long. |

## Measurements

Commands run at the repo root on Windows (Git Bash, corepack shim on PATH):

- `pnpm install --frozen-lockfile`: done in 18.4 s.
- `pnpm check` (format check, knip, lint, typecheck, `test:unit` for every package): exit 0. Turbo reported 48 of 48 tasks successful, 46 cached, 1 m 03 s. The cache means this is not a cold-run time.
- A lint probe: I piped a file with `import { createApp } from "@robkit/core"` into `eslint --stdin` as `packages/hono/src/index.ts`. It reported five errors: `robkit/layer` ("Layer rule: @robkit/hono never imports @robkit/core"), `robkit/no-json-cast`, `@typescript-eslint/no-unsafe-type-assertion`, `@typescript-eslint/no-unsafe-assignment` and `robkit/no-bare-error` (with the message naming `docs/conventions/errors.md`). So the documented rules do fail, with fix-it messages. `git status` stayed clean.

Counts (tracked `.ts/.tsx/.js` files, excluding tests, `test/` helpers, templates, e2e, `.d.ts`; 152 files):

| Measure | Value |
|---|---|
| Source lines by package | core 2322, create-robkit 2702, dev 952, guard 313, hono 49, input 566, react 48, session 1138, start 75, repo-checks 2297, test-session 361, test-postgres 336 |
| Test lines vs source lines | 15 447 vs 12 418 |
| Test files (`*.test.*`, `*.test-d.ts`) | 134, of which 18 are `*.db.test.ts` |
| Largest source files | `coolify-deploy.ts` 380, `glossary.ts` 343, `graph-check.ts` 320, `session-store.ts` 296, `create-robkit/src/check.ts` 290 (e2e: `production-stack.ts` 541, `install-journeys.ts` 498) |
| `any` (real, not in comments) | 0 |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | 0 / 0 / 0 |
| `eslint-disable` in source | 3, each with a `--` reason (`core/database.ts:11`, `input/app-env.ts:70`, `input/problem.ts:34`) |
| `as X` casts in source | 0 real (every grep hit was the word "as" in a comment). The templates have `as` in two shadcn UI files and one generated `routeTree.gen.ts`. |
| `throw new Error(` in source (non-test, non-e2e) | 23; most interpolate a detail, none matched by `no-bare-error` |
| `JSON.parse` in source | 6 |
| `console.*` in source (not templates or e2e) | 30, almost all in the CLI entry points |
| Published-package runtime dependencies | input 0, guard 1, react 1, hono 2, start 2, session 3, dev 3, create-robkit 6, core 7 |
| Catalog entries (external versions) | about 50; `catalogMode: strict` |
| Workspace packages | 9 published plus 6 tooling |
| Custom ESLint rules | 8 (`core-schema`, `layer`, `no-bare-error`, `no-brand-cast`, `no-json-cast`, `no-silent-catch`, `one-problem-type`, `relative-import-extension`), each with a test file |
| Repo-check scripts in `tooling/repo-checks/src` | about 20 (graph, catalog, glossary, doc-examples, api-report, coverage ratchet and thresholds, commit subjects, PR ticket, package scripts and more) |
| Coverage thresholds | input 100/97/100/100, session 96/93/100/99, core 96/96/91/97, create-robkit 73/66/80/74, dev 73/78/80/73 |
| Docs | 13 ADRs, 9 package/tooling READMEs, CONTRIBUTING 261 lines, architecture 186 lines |

## 1. Module boundaries: 9/10

What they do well:
- The allowed dependency edges are data. `tooling/eslint/package-graph.js` lists each package's `dependencies` and `devDependencies`, and a repo check (`tooling/repo-checks/src/graph-check.ts`, tested in `graph-check.test.ts`) fails on an unlisted edge, an unlisted import, an edge with no manifest entry, or a cycle.
- The layer rule is built from that data. `coreRows` in `tooling/eslint/layers.js:38` makes one "never imports @robkit/core" row for every package the graph keeps off core. I confirmed the rule fires on a hono file.
- The graph reads as layers: input has no dependencies, guard takes input, session takes guard and input, adapters take session and guard (`package-graph.js:30-55`), and core is the only package with a database.
- Entry files are short and say what a package is. `packages/input/src/index.ts` opens with a three-line comment saying it imports nothing and why. `packages/hono/src/index.ts` is three lines.
- Published packages may import only their `dependencies` edges, not `devDependencies` (AGENTS.md, enforced by the graph check).
- Core hides Drizzle behind its own `Database` interface (`core/src/database.ts:11-13`) so the API doesn't print Drizzle's types.

Weaknesses:
- `create-robkit` is the grab bag: 2700 lines in `src/`, plus 117 template files, covering init, add, check, deploy, Coolify, wizard and vendoring. Its entry `src/index.ts` doesn't tell you that.
- Exports point at `src`, with `publishConfig` swapping to `dist` (every `package.json`). It needs a pack check to stay honest; that check exists, but it is a second shape for every reader to hold.
- `@robkit/core` has `@robkit/dev` as a dev dependency so tests can provision a database, a small backwards edge for tests.
- `guard` has a non-standard dist path (`./dist/src/index.js`) because of `conformance.json` at its root.

Worth copying into robkit:
- Nothing further; this is the strongest category. The one change is to split create-robkit's `deploy` and `check` commands into their own folders, or packages.

To raise this by one point:
- Split `packages/create-robkit/src` into subfolders by command (`init/`, `add/`, `deploy/` for `coolify-*.ts` and `deployment.ts`, `check/`), and give `src/index.ts` a header comment listing them. Add a layer row so `deploy/` can't import `wizard.ts`.
- Move the `@robkit/core` test dependency on `@robkit/dev`: put `provisionDatabase` (the step core's tests use) in `@internal/test-postgres`, and delete the edge from `package-graph.js`.
- Make `guard`'s `conformance.json` live under `src/` so its dist path matches the other packages (`packages/guard/package.json` exports).

## 2. Public API design: 8/10

What they do well:
- Each package has an `api-report.md` (checked by `tooling/repo-checks/src/api-report.ts`, regenerated with `api:update`), so any change to an export shows in the diff.
- Adapters expose very little: hono is `guarded`, `sessionFetch` and two types; react and start are similar.
- Callers cannot easily misuse the inputs. `requestGuard` takes a `Slug` that only `readSlug` can make, and `packages/session/src/request-guard.test-d.ts` asserts that with `expectTypeOf`. Results are tagged unions (`RequestDecision = { viewer } | { response }`).
- Every `ts` fence in the docs is compiled against the built packages (`tooling/repo-checks/src/doc-examples.ts`), so the documented API is the real API. That test ran in my `pnpm check` (30 s).
- Failure classes stay private (`CoreUnreachableError`, `AccessRuleError`); callers get `GuardFault` instead (`docs/conventions/errors.md`).

Weaknesses:
- `@robkit/input` exports about 30 names from `packages/input/src/index.ts`, mixing generic helpers (`isRecord`, `parseJson`, `allProblems`), env readers (`readHost`, `readPort`, `readDatabaseUrl`), slug and manifest readers, and exit helpers (`orExit`, `readDevServerEnv`). A user can't tell from names which are for app authors and which are for robkit's internals.
- Several create-robkit helpers take `unknown` and return optional strings (`fieldOf`, `stringFieldOf` in `coolify-api.ts`). Callers can pass anything and the compiler can't help.
- `@robkit/session` has three entry points (`.`, `./addresses`, `./lapsed`) and guard has `./conformance` and `./conformance.json`; each is documented, but there is more to learn than one entry.

Worth copying into robkit:
- Nothing new; keep the API report plus `*.test-d.ts` pairing.

To raise this by one point:
- Split `packages/input/src/index.ts` into a small public set for app authors (`readSlug`, `readDomain`, `readDatabaseUrl`, `orExit`, `readServeEnv`, `readDevServerEnv`, `readGuardEnv`, `Slug`, `InputProblem`) and a `@robkit/input/internal` or `/readers` subpath for the rest, then update `packages/input/api-report.md`.
- Replace the `unknown`-taking helpers in `packages/create-robkit/src/coolify-api.ts` with one typed reader for the Coolify responses robkit uses (application, project, server), built with the same `InputProblem` pattern as `@robkit/input`.

## 3. Type safety at the edges: 9/10

What they do well:
- `tooling/typescript/base.json` turns on `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` and `erasableSyntaxOnly`.
- ESLint runs `strictTypeChecked` and `stylisticTypeChecked` (`tooling/eslint/index.js:34-35`) and adds `no-unsafe-type-assertion` outside tests. I counted zero real `any` and zero ts-suppression comments in 152 source files, and zero casts.
- Two custom rules close the usual gaps: `robkit/no-json-cast` stops `JSON.parse(...) as T` (I saw it fire), and `robkit/no-brand-cast` stops casts to branded types everywhere, tests included. Tests build brands with `slug`, `aRoleId`, `aViewer` from `@internal/test-session`.
- Outside input is read once through `@robkit/input` (`docs/conventions/input.md`): env, JSON, manifests and slugs return the typed value or an `InputProblem`. Core's `readDeclaredApps` (`core/src/apps.ts:50-72`) parses `ROBKIT_APPS` element by element and returns the first problem.
- Branded ids: `Slug`, `CodeId`, `RoleId`, `Viewer`, `CoreOrigin`, `Domain`.

Weaknesses:
- Hand-written readers don't derive their type and their check from one schema. `readAccessRule`, `readDeclaredApp` and the Coolify `fieldOf` helpers each repeat shape knowledge by hand, so a type and its reader can drift without the compiler noticing.
- `core/src/database.ts:11` needs an `eslint-disable` for an empty interface that extends the Drizzle connection type.
- `readAccess` in `core/src/apps.ts:34-43` builds `{ error: string }` literals by hand; the type is `InputProblem` but nothing ties the two except the lint rule.

Worth copying into robkit:
- Nothing; robkit is the example here. TanStack-style schema-first readers (one definition that gives both the validator and the type) would be the only gain.

To raise this by one point:
- Pick one small schema helper (a tiny in-house `object({ ... })` combinator in `packages/input/src/` returning `T | InputProblem`) and rewrite `readAccessRule` (`packages/guard/src/guard.ts`), `readDeclaredApp` (`packages/input/src/manifest.ts`) and the Coolify readers with it, so each type is derived from its reader.
- Replace the `Database extends Connection {}` hack at `packages/core/src/database.ts:11` with a branded type alias, and delete the disable.

## 4. Naming and domain language: 9/10

What they do well:
- `GLOSSARY.md` defines the terms, lists words to avoid, and `tooling/repo-checks/src/glossary.ts` (343 lines, with `glossary.test.ts`) fails the build on an avoided word, with a place for reasoned exceptions.
- File names predict content: `access-codes.ts`, `session-claims.ts`, `mint-token.ts`, `signing-key.ts`, `rate-limit.ts`, `refresh-protocol.ts`, `loopback-fetch.ts`. Test files sit beside their source with matching names, and `.db.test.ts` marks Docker tests.
- Package names say the layer: input, guard, session, hono, start, react, core, dev.
- Tickets and ADRs use the same words as the code (`docs/adr/` links its ticket).

Weaknesses:
- A few words carry two jobs: "install" is both a whole deployment and `install()` in `@robkit/session/addresses`; "app" is both an owner's app and a platform app (`isPlatformApp`); `Profile` (core) and `Viewer` (guard) describe the same person at two layers.
- `dev` the package, `robkit-dev` the binary and "the dev runner" in prose are three names for one thing.
- `core/src/apps.ts` holds both reading `ROBKIT_APPS` and registering apps in the database, so the file name covers two concerns.

Worth copying into robkit:
- Nothing new.

To raise this by one point:
- Add "install (address helper)" vs "install (deployment)" rows to `GLOSSARY.md` or rename `install()` in `packages/session/src/addresses.ts` to `addressesFor()`, and let `glossary.ts` fail on the old name.
- Rename the `@robkit/dev` binary and prose to one term; the README at `packages/dev/README.md` and `docs/architecture.md` should use the same word.

## 5. Simplicity: 7/10

What they do well:
- Runtime dependencies are tiny: input 0, guard 1, react 1, hono 2, start 2, session 3, dev 3 (table above). Core's seven are Hono, Drizzle, postgres, jose and the robkit packages.
- Files are small. The largest non-e2e source file is 380 lines. `packages/hono` is 49 lines and `packages/react` 48.
- Flow is traceable: `docs/architecture.md` gives the request sequence, and the code matches it (`requestGuard` calls the pure `guard`, which returns allow, login, refresh or not-found).
- knip runs in `pnpm check`, which keeps dead exports out.

Weaknesses:
- 15 workspace packages and about 20 repo-check scripts, 8 custom lint rules and a package graph file guard about 12 000 lines of product source. A reader has to learn a lot of tooling before a one-line change. Tooling is about 5 300 lines (`repo-checks` 2297, `e2e` 2210, `test-*` 700), nearly half the product.
- The `.ts` import extension, `src` exports with a `publishConfig` swap, and dist builds with a second tsconfig (`tsconfig.build.json`) add moving parts.
- `create-robkit` has 117 template files and a `shadcn-kit.ts` script (211 lines) to keep them in step with shadcn.
- Some one-caller helpers: `valueOf`, `normalizeRepo`, `pick` in `coolify-deploy.ts`; route builders like `tooManyAttempts` in `routes/session.ts:20`.

Worth copying into robkit:
- None; this is the category to simplify.

To raise this by one point:
- Merge repo checks that guard the same artifact: fold `check-coverage-thresholds.ts`, `check-coverage-ratchet.ts` and `coverage-thresholds.ts` into one `coverage.ts` module, and `commit-subject.ts` into `check-commit-subjects.ts`; the README for repo-checks should then list about 12 checks, not 20.
- Move `packages/create-robkit/src/coolify-*.ts` and `deployment.ts` into a `deploy/` folder (or a separate `@robkit/deploy` package) so `create-robkit` is only init, add and check.
- Remove the `src` / `dist` export duality by building before use, or by publishing source with `.ts` entries; either way, delete the pack check and `tsconfig.build.json`. (This is the biggest design call and could be wrong; measure first.)

## 6. Consistency: 9/10

What they do well:
- One way to read input (`@robkit/input` readers), one way to fail (tagged values for expected, `Error` with `cause` for faults, `CommandProblem` for CLIs). Lint rules `one-problem-type`, `no-bare-error`, `no-silent-catch` and `preserve-caught-error` hold it.
- Every package has the same script names, checked by `tooling/repo-checks/src/package-scripts.ts`; each package has a `vitest.config.ts` with thresholds in the same form.
- Imports use `.ts` extensions (enforced) and never leave a workspace by relative path (enforced).
- Versions only live in the catalog (`catalogMode: strict` plus `catalog.test.ts`).
- Core's route files all take a `RouteContext` and return a `Hono` router (`routes/session.ts`, `routes/apps.ts`, `routes/roles.ts`).

Weaknesses:
- CLI output goes through bare `console.log` in `create-robkit-command.ts` and `robkit-command.ts` (about 10 calls), while `coolify-deploy.ts:338` takes an injected `log = console.log`. Two ways to print.
- `dev/src/runner.ts:29` uses `console.error` directly, while core logs through `logError`.
- Several files in `create-robkit/src` have no matching `.test.ts` (`coolify-api.ts`, `add-wizard.ts`, `robkit-repo.ts`) while most do.

Worth copying into robkit:
- Nothing new.

To raise this by one point:
- Add a `print` or `log` parameter to every command in `packages/create-robkit/src/robkit-command.ts` and `create-robkit-command.ts` (as `coolify-deploy.ts` already does), then add a `no-console` ESLint row for `packages/*/src` outside `cli.ts` entry points.
- Route `packages/dev/src/runner.ts:29` through the same output function the other dev commands use.

## 7. Error handling: 9/10

What they do well:
- `docs/conventions/errors.md` sets the rule and the code follows it. Expected failures are unions with an `outcome` field (`AccessChange`, `SignIn`, `Decision`, `RequestDecision`). Faults throw with `cause`.
- Boundaries are explicit: core has one `app.onError` handler that logs the cause with a request id and answers a generic 500 carrying the id; the guard answers 503 rather than treating a failed check as signed-out and reports through `onUnavailable` with a typed reason (`core-key`, `access-rule`, `network`).
- CLI failures that the person can fix are `CommandProblem` with sentences that say what to do next ("Delete the extras.", "Set COOLIFY_TOKEN to deploy.", `coolify-deploy.ts:74-100`). Unexpected ones print a bug notice with the stack.
- Lint stops the usual bad habits: silent `catch`, `throw new Error("fixed text")` with no cause, and re-throwing a problem's `.error` string. I saw `no-bare-error` fire, with a message pointing to the doc.
- Every outbound request needs a timeout (AGENTS.md), and there is a ticket trail (`call-core-body-deadline.md`).

Weaknesses:
- Some `throw new Error` messages have a detail but no `cause` or class where a caller might want one: `create-robkit/src/generate.ts:63` ("the install has no ${path}"), `generate.ts:114`, `guard/src/conformance.ts:52,57`. They start lowercase and don't say what to do next.
- `input/problem.ts:35` turns a problem into `new Error(read.error)` (the one allowed place, with a disable) and loses the structure; callers of `orThrow` get a string.
- `InputProblem` is `{ error: string }`: no code, no field path. A caller can only show it, not branch on it.
- Failures in core's routes are strings at the HTTP edge (`{ error: "Too many attempts..." }`), with no machine-readable code for clients.

Worth copying into robkit:
- Nothing new.

To raise this by one point:
- Give `InputProblem` an optional `field` (or `source`) and give core's HTTP errors a `code` string next to `error` (`packages/input/src/problem.ts`, `packages/core/src/routes/*.ts`), so the hub and admin can branch on a code rather than match text.
- Rewrite the remaining plain throws (`generate.ts:63,114`, `conformance.ts:52,57,104`) as `CommandProblem` (when the person can fix it) or as faults naming the thing and carrying `cause`.

## 8. Testing: 8/10

What they do well:
- Tests call the public interface. `packages/session/src/request-guard.test.ts` builds a `requestGuard` against `fakeCore` (from `@internal/test-session`), sends real `Request` objects and checks the `Response` and set-cookie headers.
- Type-level tests: every adapter-facing package has a `*.test-d.ts` and runs `vitest run --typecheck` (`session/package.json` scripts).
- Fast split: `test:unit` needs no Docker and is in `pnpm check`; 18 `*.db.test.ts` files and the e2e run in CI. The `check` run finished in about one minute with a warm cache.
- A true end-to-end path: `tooling/e2e` generates installs on both stacks, adds an app with `robkit add`, drives Chromium through owner, guest, role and theme journeys, runs axe, runs the install's own CI and checks that its pre-commit hook refuses a layer break (`docs/testing.md`). A production test runs the default install over https behind Caddy.
- Lint rules have tests of their own (`tooling/eslint/*.test.js`), including the exact messages.
- Coverage thresholds sit at CI's measurement (input 100/97/100/100; session 96/93/100/99; core 96/96/91/97) and a ratchet job fails a threshold that is more than 2 points low.
- Tests aim at behaviour: the doc-examples test compiles every README fence.

Weaknesses:
- `create-robkit`, the package people run first, has the lowest thresholds (73/66/80/74); in my run `wizard.ts` showed 26% statements and 30% lines, `usage.ts` 83% branches. The prompts are the part a newcomer sees.
- `pnpm check` skips the DB suites, so on Windows (without WSL) core's SQL and sessions are untested locally. Core's coverage figure includes them only in CI.
- e2e has no thresholds (stated in AGENTS.md) and test time is only reported, not budgeted.
- Some test helpers are large (`test-session/src/index.ts` 282 lines, `e2e/src/production-stack.ts` 541 lines), so reading a failure can mean reading a second program.
- Snapshot tests exist in create-robkit (`src/__snapshots__/*.snap`, 359 lines), which break on any template edit.

Worth copying into robkit:
- Nothing new.

To raise this by one point:
- Test `packages/create-robkit/src/wizard.ts` and `add-wizard.ts` through an injected prompt (a fake `@clack/prompts` answer queue), then raise `packages/create-robkit/vitest.config.ts` to about 85/75/90/85.
- Give `pnpm check` a cheap DB path: a `pnpm check:db` script (or a `check` step that starts one Postgres when Docker is reachable) so a contributor on Windows sees core's `*.db.test.ts` failures before CI; document it in `CONTRIBUTING.md`.
- Replace the large inline snapshot in `packages/create-robkit/src/__snapshots__/` with assertions on specific files' contents, so a template edit breaks only the test that cares.

## 9. Keeping standards up: 9/10

What they do well:
- Written rules have machines: the layer rule (lint + graph check), the glossary (repo check), docs examples (compiled), public API (API reports), versions (catalog test), scripts (package-scripts check), commit subjects (hook + CI per commit), coverage (thresholds + ratchet), PR ticket (CI reads the PR body), changesets (CI `changeset status`), suppressions (reasons required, unused ones fail).
- I verified the lint rules fire on bad code (see Measurements); every rule has its own test file.
- `knip` in the gate; Renovate config tested by `renovate.test.ts`; Dependency release-age guard.
- CI's one required `gate` job fails if a job fails, is cancelled, or is skipped on a PR (`ci.yml`, end). Nightly and production workflows exist.
- Pre-commit runs ESLint fixes and Prettier on staged files; commit-msg checks the subject (`.husky/`).
- AGENTS.md and CLAUDE.md hold rules for AI contributors, and they match the checks (every rule I tried in AGENTS.md had an enforcer).
- `robkit check` and the generated install carry the install-side layer rule, and the e2e test proves the install's hook refuses a violation.

Weaknesses:
- CODEOWNERS is one line (`* @RobertScholey98`); there is no review bot, and branch protection is not in the repo, so "the one required check" is a claim I can't verify from the code.
- The `PR template` has two unchecked boxes that nothing reads (the Ticket section is the one that's checked).
- No generator for a new package, a new core route or a new repo check; the AGENTS.md instructions for adding a package are prose plus three places to edit (`package-graph.js`, `api-report.md`, `package-scripts.ts`).
- `check` and `check:all` differ, so a green local run doesn't predict CI.

Worth copying into robkit:
- Nothing new; this is the category to copy from.

To raise this by one point:
- Add a `pnpm new:package <name>` script (in `tooling/repo-checks` or a new `tooling/generate/`) that writes the `package.json`, `vitest.config.ts`, tsconfigs, README stub, graph entry and API report, and a test that runs it in a temp copy.
- Check the repo settings from code: add a `tooling/repo-checks/src/branch-protection.ts` run in the nightly workflow that reads `gh api repos/.../branches/main/protection` and fails unless `gate` is required.

## 10. Nice to work in as a human: 8/10

What they do well:
- Each package README says what it is for, gives an example, lists exports and the layer rule, and some end with "For contributors" (`packages/core/README.md`, `packages/create-robkit/README.md`). The examples compile.
- `CONTRIBUTING.md` (261 lines) covers prerequisites, WSL steps for Windows, a worked first change, planning without a ticket and troubleshooting.
- `docs/architecture.md` has Mermaid diagrams of the install and the request sequence, with links to 13 ADRs.
- `pnpm create-install` makes an install linked to the checkout, so there is a playground (`package.json` scripts).
- Tooling READMEs tell you what to do on failure (`tooling/eslint/README.md`, `tooling/repo-checks/README.md`); lint messages cite the doc to read.
- Folder layout is easy: `packages/` for published, `tooling/` for private, `docs/`, `.scratch/` for tickets with a map.
- Comments explain why (`core/src/routes/session.ts:36-39` on separate rate limits; `ci.yml` on the host network and Chromium's `ERR_NETWORK_CHANGED`).

Weaknesses:
- The full suite needs Docker and Linux; on Windows it needs WSL with the repo cloned into WSL's file system (CONTRIBUTING). A Windows contributor can run only the fast gate.
- Day-one cost is high: about 15 workspace packages, 8 lint rules, 20 repo checks, an `.scratch/` ticket system with 27 build tickets, and CLAUDE.md's workflow. The "Where things are" list in AGENTS.md has 10 doc pointers.
- The `pnpm check` log is long and unfiltered (coverage tables for every package print); there is no summary line saying which gate failed first.
- No `examples/` folder in the repo; the generated install is the example, which needs a run to look at.

Worth copying into robkit:
- Nothing new.

To raise this by one point:
- Add a "Make your first change in 10 minutes" block to the top of `README.md` that points at one worked file (for example `packages/guard/src/guard.ts` plus its test) and the three commands to run, with the output you should see.
- Make `pnpm check` quiet by default (`--output-logs=errors-only` in the root `package.json` `check` script) and print one line per gate, with a hint to re-run the failing package.
- Add `examples/` or a `docs/tour.md` that shows a generated install's tree, so a reader needn't generate one.

## Top 5 practices to copy

1. Package graph as data with three enforcers (lint rule, graph test, import check): `tooling/eslint/package-graph.js`, `tooling/eslint/layers.js:38`, `tooling/repo-checks/src/graph-check.ts`.
2. Custom lint rules whose messages name the doc to read and the fix, each with its own tests: `tooling/eslint/no-bare-error.js` and `no-bare-error.test.js`, `no-json-cast.js`, `no-brand-cast.js`.
3. Every code fence in the docs compiles against the built packages: `tooling/repo-checks/src/doc-examples.ts`.
4. One input-reading package that returns `T | InputProblem`, with branded results, plus `*.test-d.ts` type tests: `packages/input/src/index.ts`, `packages/session/src/request-guard.test-d.ts`.
5. Coverage thresholds that may only ratchet, checked per PR and against CI's measurement: `tooling/repo-checks/src/check-coverage-ratchet.ts`, `check-coverage-thresholds.ts`, `.github/workflows/ci.yml`.
