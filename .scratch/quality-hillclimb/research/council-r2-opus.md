# robkit quality report

Commit: f2a16c1 (branch 53-round-2). Reviewer: Opus.

Scope: all eight published packages under `packages/` (guard, session, hono, start, react, core, dev, create-robkit, including `create-robkit/templates`), all of `tooling/` (eslint rules, repo-checks, test-postgres, test-session, e2e), the root config, `.github/`, `.husky/`, `docs/`, the READMEs, GLOSSARY, CONTRIBUTING and AGENTS. I also skimmed `.scratch/kit/map.md` and the ticket list for category 10. I did not read anything under `.scratch/quality-hillclimb/` except the rubric. I did not run Docker-backed suites (`*.db.test.ts`, e2e, test-postgres), but I did read GitHub Actions results for this exact commit.

## Scores

| #   | Category                    | Score | One-line reason                                                                                                                                               |
| --- | --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Module boundaries           | 8     | One package graph drives a lint rule and a repo check with cycle detection. Entry files are tiny, but `@robkit/session` is a grab bag with 6 entry points.     |
| 2   | Public API design           | 8     | Small, branded, API-reported and type-tested exports. Session exposes 60 symbols, and some options are plain strings checked by a constructor throw.           |
| 3   | Type safety at the edges    | 8     | Strictest tsconfig flags, 0 casts or `any` in published non-test code, every env var and body goes through a reader. Origins and domains stay plain `string`. |
| 4   | Naming and domain language  | 8     | A 22-term glossary, enforced by a repo check, and names match it. Package and subpath names drift from what they hold.                                        |
| 5   | Simplicity                  | 7     | Largest non-test file is 419 lines, the guard is a lookup table, and runtime deps are tiny. Hand-rolled readers repeat boilerplate, and create-robkit is wide. |
| 6   | Consistency                 | 8     | One reader shape, one problem type, one `Report`, one `runCommand`. A second result shape in the templates and cast-based error checks in tooling remain.     |
| 7   | Error handling              | 8     | Values for expected failures, `cause` on faults, lint-enforced catch rules, messages that say what to do. 61 bare `throw new Error` and only 2 error classes. |
| 8   | Testing                     | 8     | 887 fast unit tests through public interfaces, shared conformance cases, type tests, a whole-stack and a production e2e. One coverage threshold fails on CI.   |
| 9   | Keeping standards up        | 7     | Exceptional machinery: 6 tested custom lint rules, 15 repo-check suites, API reports. But `main` is unprotected and CI has been red for 10 runs while merging. |
| 10  | Nice to work in as a human  | 8     | README, CONTRIBUTING with a worked change, architecture, ADRs, per-package READMEs. Full suite and `pnpm dev` need WSL on Windows; the spec lives off-repo.    |

## Measurements

| What                                                                 | Result                                                                                                                                                                                  | How                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Workspace packages                                                   | 8 published (`packages/*`), 6 private (`tooling/*`)                                                                                                                                     | `pnpm-workspace.yaml`, `ls`                                                                 |
| Non-test TS source                                                   | 187 files (AST pass), about 15,200 lines incl. templates                                                                                                                                | `git ls-files` filtered on `.test.`, `.test-d.`, `/test/`                                   |
| `as` casts (not `as const`), non-test                                | 15 total: 0 in published `packages/*/src`; 1 in generated `templates/stacks/start/src/routeTree.gen.ts`; 14 in `tooling/e2e`, `tooling/repo-checks`, `tooling/test-postgres`, `tooling/test-session` | TypeScript AST walk (`ts.isAsExpression`)                                                   |
| `any` keyword, non-test                                              | 1 (the generated route tree)                                                                                                                                                            | same AST walk                                                                               |
| Non-null `!`, non-test                                               | 0                                                                                                                                                                                       | same AST walk                                                                               |
| `@ts-ignore` / `@ts-expect-error`, non-test                          | 0 in hand-written code                                                                                                                                                                  | grep                                                                                        |
| `eslint-disable`, non-test                                           | 2: `packages/core/src/database.ts:11` (with reason) and the generated route tree                                                                                                        | grep                                                                                        |
| `throw new Error`, non-test                                          | 61, of which about 6 pass `cause`                                                                                                                                                       | grep                                                                                        |
| Error classes                                                        | 2: `CommandProblem` (`packages/dev/src/run-command.ts:8`), `CoreUnreachableError` (`packages/session/src/loopback-fetch.ts:55`)                                                         | grep `class \w+(Error\|Problem)`                                                            |
| Largest non-test files                                               | `session/src/request-guard.ts` 419, `create-robkit/src/coolify-deploy.ts` 369, `templates/base/apps/admin/src/client/Admin.tsx` 354, `repo-checks/src/glossary.ts` 343                  | `wc -l`                                                                                     |
| Exported symbols per package (API report `export` lines)             | react 1, hono 4, start 4, core 11, create-robkit 12, guard 15, dev 16, session 60                                                                                                       | `grep -c '^export ' packages/*/api-report.md`                                               |
| Runtime dependencies of published packages                           | guard 0, react 1, hono 2, start 2, session 2, dev 2, core 6, create-robkit 5                                                                                                            | `package.json` `dependencies`                                                               |
| Catalog entries                                                      | 46, `catalogMode: strict`                                                                                                                                                               | `pnpm-workspace.yaml`                                                                       |
| Test files                                                           | 103 (18 `*.db.test.ts`), 6 `*.test-d.ts`, about 665 `it`/`test` calls                                                                                                                   | `git ls-files`, grep                                                                        |
| Mocks                                                                | 2 files use `vi.mock`, 0 `vi.fn`, 4 `spyOn`                                                                                                                                             | grep                                                                                        |
| `pnpm install --frozen-lockfile && pnpm check` (warm cache)          | exit 0, 44/44 tasks, 43 cached, 44.7 s                                                                                                                                                  | Git Bash on Windows                                                                         |
| Same gate with `turbo --force` (cold)                                | exit 0, 0 cached, 1 m 20 s; 887 unit tests passed, 1 skipped                                                                                                                            | `pnpm format:check && pnpm knip && turbo run lint typecheck test:unit --force`              |
| Lint probe                                                           | A temp file in `packages/hono/src` importing `@robkit/core`, casting `JSON.parse`, swallowing a catch and returning `{ error: string }` got 9 errors, each naming its rule or doc        | `npx eslint src/zz-probe.ts`, file deleted afterwards                                       |
| Lint probe gap                                                       | A relative import into `../../guard/src/guard.ts` was not flagged by ESLint. `tooling/repo-checks/src/graph-check.ts:150-174` catches it at test time                                   | same probe                                                                                  |
| CI at this commit                                                    | `check` failed: `@internal/test-postgres` branches 48.64% below threshold 51%                                                                                                           | `gh run view 42154300868 --log-failed` (head SHA f2a16c1)                                   |
| CI history                                                           | Last 10 CI runs on the ticket chain failed (9 on test-postgres coverage, 1 on a hub typecheck); the branches were still merged into each other                                          | `gh run list --workflow CI`                                                                 |
| Branch protection on `main`                                          | None: "Branch not protected" (HTTP 404)                                                                                                                                                 | `gh api repos/RobertScholey98/robkit/branches/main/protection`                              |

## 1. Module boundaries — 8/10

What they do well:
- One source of truth for the package graph. `tooling/eslint/package-graph.js:28-92` lists every allowed edge, split into runtime and dev edges. `tooling/eslint/layers.js:40-63` builds the "never imports core" rows from it, and `tooling/repo-checks/src/graph-check.ts:148-190` fails on an undeclared `package.json` edge, a dev-only package imported from runtime code, a relative import that leaves its folder, and a cycle.
- The lint error names the rule and why. My probe got `Layer rule: @robkit/hono never imports @robkit/core. Code reaches core over HTTP only`.
- Entry files are short re-export lists. `packages/core/src/index.ts` is 7 lines and 9 names; `packages/hono/src/index.ts` is 2 lines. You can read the package's surface from it.
- The pure core is truly pure. `packages/guard/src/guard.ts` has zero imports and zero dependencies; adapters (`packages/hono/src/guarded.ts`, 30 lines) only wrap `requestGuard`.

Weaknesses:
- `@robkit/session` holds six concerns behind six entry points (`packages/session/package.json` exports `.`, `./app-env`, `./addresses`, `./input`, `./lapsed`, `./manifest`): tokens, the request guard, env readers, JSON readers, the manifest format, install addresses and the fault reporter. Core, dev, create-robkit and every template import `@robkit/session/input` to read env, which has nothing to do with sessions. You cannot understand it from its entry file.
- Crossing into another package by relative path is caught only by a repo-check test, not by ESLint, so an editor shows nothing until `pnpm check` runs.
- Core's HTTP contract has no shared module. The hub and admin re-declare core's response shapes and paths by hand (`packages/create-robkit/templates/base/apps/hub/src/core-api.ts`), so the boundary is enforced only by the e2e journey.

To raise this by one point:
- Split the input readers and the manifest out of session into a framework-free `@robkit/config` (or `@robkit/input`) package: move `packages/session/src/input.ts`, `problem.ts`, `app-env.ts` and `manifest.ts` there, add its node to `tooling/eslint/package-graph.js`, and leave session with tokens, `requestGuard` and addresses.
- Add a `folders` entry for every workspace in `tooling/eslint/layers.js` (not just `packages/core`) so a relative import into another package fails in the editor, with the same message `graph-check.ts:174` prints.

## 2. Public API design — 8/10

What they do well:
- Small surfaces where it matters: react exports one function, hono and start four symbols each (`packages/*/api-report.md`).
- Brands that only a reader can mint: `RoleId`, `CodeId` (`packages/guard/src/guard.ts:1-14`) and `Slug` (README of session: "only `readSlug` makes a `Slug`").
- Discriminated unions that make misuse hard. `Decision` only carries `viewer` when `outcome === "allow"`, and `packages/guard/src/guard.test-d.ts` asserts that at the type level.
- Every published package has a generated `api-report.md`, so an API change shows up in review, and `tooling/repo-checks/src/published.ts` packs each package and runs publint and Are the Types Wrong.

Weaknesses:
- `@robkit/session` exports 60 symbols, five times the next largest package.
- `GuardedOptions.core` is a plain `string` (`packages/session/src/request-guard.ts:43`), and a wrong value throws at construction (`request-guard.ts:113-120`). The type lets you pass any string; a branded `CoreOrigin` from `readCoreUrl` would make it a compile error.
- Subpath names don't match their files: `./addresses` is `install-addresses.ts`, `./lapsed` is `session-lapsed.ts`.
- `OwnerViewer.id` is `string` while `GuestViewer.id` is the branded `CodeId` (`guard.ts:58-67`).
- `readAccessRule` accepts `{ kind: "roles", roles: [] }` (`guard.ts:143-150`), which quietly means owner-only. CONTRIBUTING uses this very bug as its worked example, so it is known and unfixed.

To raise this by one point:
- Make `readCoreUrl` in `packages/session/src/input.ts` return a branded `CoreOrigin`, take that type in `GuardedOptions.core`, and delete the runtime throw in `installOf` (`request-guard.ts:113-121`). Update the three `*.test-d.ts` files to assert a raw string fails.
- Shrink session's root export after the split in category 1, and rename the subpath files to match (`install-addresses.ts` to `addresses.ts`, `session-lapsed.ts` to `lapsed.ts`), regenerating `packages/session/api-report.md`.

## 3. Type safety at the edges — 8/10

What they do well:
- `tooling/typescript/base.json` turns on `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` and `erasableSyntaxOnly`, with `strictTypeChecked` ESLint on top (`tooling/eslint/index.js:31-32`).
- Zero casts, zero `any` and zero non-null assertions in hand-written published source, by AST count. Lint enforces it: `@typescript-eslint/no-unsafe-type-assertion` and `robkit/no-json-cast` outside tests (`tooling/eslint/index.js:40-55`).
- Every env var goes through a reader that returns a value or an `InputProblem` naming the variable and the fix (`packages/session/src/input.ts:38-62`), and `readCoreConfig` collects every bad variable at once (`packages/core/src/env.ts:35-60`).
- HTTP bodies go through `readBody(c, reader)` (`packages/core/src/routes/context.ts:39-45`), and route params through `readCodeId` / `readRoleId`.

Weaknesses:
- Origins and domains are plain strings after they are read: `CoreConfig.domain` (`packages/core/src/env.ts:20`), `CoreOptions.domain` (`app.ts:21`), `GuardedOptions.core`. A function cannot tell a checked domain from any string.
- `fieldsOf` turns a JSON array or string into `{}` (`routes/context.ts:31`), so the caller gets "missing field" rather than "send an object".
- The readers are hand-written per field, which works but each new input repeats the `isProblem(a) || isProblem(b) || ...` chain (`env.ts:43-50`).
- The tooling packages turn the cast rule off wholesale (`tooling/e2e/eslint.config.js`, same in test-session and test-postgres), giving 14 casts, including `(error as NodeJS.ErrnoException).code` in `tooling/test-postgres/src/watcher.ts:16` where `isMissing`-style guards exist elsewhere.

To raise this by one point:
- Brand `Domain` and `CoreOrigin` in `packages/session/src/input.ts` (`readDomain`, `readCoreUrl` as their only makers) and use them in `packages/core/src/env.ts`, `packages/core/src/app.ts` and `request-guard.ts`.
- Make `fieldsOf` in `packages/core/src/routes/context.ts` return a problem ("Send a JSON object.") for non-object JSON, with a test in core's routes tests.
- Turn `no-unsafe-type-assertion` back on in `tooling/test-postgres` and `tooling/test-session` (they are small) and replace their 4 casts with guards.

## 4. Naming and domain language — 8/10

What they do well:
- `GLOSSARY.md` defines 22 terms (Owner, Guest, Install, Core, Hub, Viewer, Profile, Guard, Adapter and so on), with flagged ambiguities, and `tooling/repo-checks/src/glossary.ts` fails on avoided words in docs, READMEs and `src`.
- Code uses the glossary's words: `Viewer`, `AccessRule`, `Install`, `Slug`, `RoleId`, `CodeId`, `requestGuard`, `guarded`.
- Comments speak the domain: "The owner may open every app" (`guard.ts:47-49`).

Weaknesses:
- The package name `session` does not predict that env readers, the manifest and the install's addresses live there. A newcomer looking for "where is `ROBKIT_DOMAIN` read" would not guess `@robkit/session/input`.
- File names drift from the concept: access codes appear as `access-codes.ts`, `routes/codes.ts`, `login-code.db.test.ts`, `generated-codes.db.test.ts` in core.
- The hub template names its type `Profile` but its fields `viewer: Profile` (`templates/base/apps/hub/src/core-api.ts:21`, `launcher.tsx:18`), so the two glossary terms blur in one line.

To raise this by one point:
- Name packages and subpaths for what they hold (see category 1), and rename `packages/core/src/routes/codes.ts` to `routes/access-codes.ts` to match `access-codes.ts`.
- In the hub template, rename the `viewer: Profile` fields in `core-api.ts` and `launcher.tsx` to `profile`, or add the rule to the glossary entry for Profile.

## 5. Simplicity — 7/10

What they do well:
- The guard's whole decision is one table (`packages/guard/src/guard.ts:95-121`) and a 10-line `guard` function. You can read every outcome in one screen.
- Modules are small: the largest non-test source file is 419 lines and most are under 200.
- Runtime dependencies are minimal: guard has none, adapters two workspace deps each, core six.
- Adapters are genuinely thin (`packages/hono/src/guarded.ts` is about 30 lines).

Weaknesses:
- `requestGuard` (`packages/session/src/request-guard.ts:224-419`) is a 195-line closure holding `unavailable`, `cookie`, `toCore`, `arrive`, `sessionOf` and the dispatcher. It is readable, but a question like "what does the callback do" means scrolling past everything else in one scope.
- `create-robkit` holds the scaffolder, `robkit add`, `robkit check`, and a Coolify deploy client (`coolify-api.ts`, `coolify-config.ts`, `coolify-deploy.ts`, 600 lines) in one package with about 30 source files.
- Several tiny files with one caller: `packages/dev/src/files.ts` (4 lines), `packages/dev/src/cli.ts` (8), `packages/create-robkit/src/set-up.ts` (14).
- The env reading pattern costs a lot of lines per variable (see category 3).

To raise this by one point:
- Split `requestGuard` in `packages/session/src/request-guard.ts` into the callback handler (`arrive`, `stateIn`, `sameState`, `nextOn`) and the per-request decision, in two files, keeping `requestGuard` as the 20-line dispatcher.
- Move the Coolify deploy (`packages/create-robkit/src/coolify-*.ts`) behind its own entry or package so `create-robkit` is about making and changing an install.
- Inline the one-caller files `packages/dev/src/files.ts` and `packages/create-robkit/src/set-up.ts` into their callers.

## 6. Consistency — 8/10

What they do well:
- One input shape: every reader returns `T | InputProblem`, and `robkit/one-problem-type` (`tooling/eslint/one-problem-type.js`) refuses a home-made `{ error: string }`.
- One report shape, `Report = (message, cause?) => void`, used by core's `logError`, the guard's `onUnavailable` and `runCommand` (`docs/conventions/errors.md`, "One way to report").
- One way to run a CLI: `runCommand` and `CommandProblem` from `@robkit/dev/cli` for `create-robkit`, `robkit` and `robkit-dev`.
- One version list: `catalogMode: strict` plus `tooling/repo-checks/src/catalog.ts`.
- One test-script shape, checked by `tooling/repo-checks/src/package-scripts.ts`.

Weaknesses:
- The templates add a third result shape, `Result<T> = { ok: true; value } | { ok: false; error }` (`templates/base/packages/core-client/src/call-core.ts:2`), beside `InputProblem` and `Decision`.
- 13 template sites repeat `if (isProblem(x)) throw new Error(x.error)` (`templates/stacks/*/src/server.ts`, `database.ts`, `vite.config.ts`, `apps/*/vite.config.ts`) instead of one helper.
- Tooling checks errors by cast (`tooling/test-postgres/src/watcher.ts:16`) where `packages/dev/src/apps.ts:113-118` uses an `isMissing` guard.

To raise this by one point:
- Add `orThrow(value: T | InputProblem): T` to `packages/session/src/input.ts` (or the split-out package), and use it at the 13 template sites.
- Make `callCore` in `templates/base/packages/core-client/src/call-core.ts` return `T | InputProblem`-style values, or document `Result` in `docs/conventions/errors.md` as the one client-side shape.

## 7. Error handling — 8/10

What they do well:
- A written rule (`docs/conventions/errors.md`) that machines enforce: `preserve-caught-error` with `requireCatchParameter`, `robkit/no-silent-catch` (`tooling/eslint/no-silent-catch.js`, which also covers `.catch(() => ...)`), and `robkit/one-problem-type`. My probe confirmed each fires.
- Expected failures are values: `Decision`, `{ outcome: "taken" }`, `InputProblem`.
- Messages tell the user what to do: "ROBKIT_DOMAIN is "x", which isn't a domain. Set it to the install's domain alone, such as robkit.dev, with no scheme, port or path." (`packages/session/src/input.ts:93-95`); "Allow cookies for this site and try again." (`request-guard.ts:289`).
- Core's single `onError` gives each fault a request id in the body and `X-Request-Id`, and keeps the cause in the log (`packages/core/src/app.ts:79-95`).
- The guard answers 503 rather than "signed out" when it cannot check, and tags the fault `core-key`, `access-rule` or `network` (`request-guard.ts:54-74`).

Weaknesses:
- 61 bare `throw new Error` in non-test source, about 6 with `cause`, and only 2 error classes. Most are well-worded faults, but a caller cannot tell "core doesn't know this app" (`packages/session/src/core-access.ts:37`) from "core answered 500" (`core-access.ts:40`) without parsing the message.
- In app templates a user-fixable env mistake becomes a raw stack: `if (isProblem(guard)) throw new Error(guard.error)` (`templates/stacks/start/src/server.ts:15`). The conventions give CLIs `CommandProblem` but give app servers no equivalent.
- `throw new Error(parsed.error)` in `packages/create-robkit/src/json.ts:9` and `vendor.ts:21` turns an `InputProblem` into an untyped fault.

To raise this by one point:
- Give app servers a clean exit for config problems: a `startOrExit(problem)` in `@robkit/session/app-env` that prints the problem alone and exits 1, used by every `templates/**/server.ts`, `serve.ts` and `database.ts`.
- Tag the access-rule failures in `packages/session/src/core-access.ts` (unknown app vs bad answer) so `GuardFault` can carry them, and add `cause` to the remaining rethrows a grep for `throw new Error` inside `catch` finds.

## 8. Testing — 8/10

What they do well:
- 887 unit tests run in 80 s cold on Windows, 45 s warm. They call public entry points: adapters' tests import from `./index.ts` and drive a real Hono app with `app.request` (`packages/hono/src/guarded.test.ts:22-38`).
- One conformance table for every adapter: `packages/guard/conformance.json`, read by `@robkit/guard/conformance` and run by hono, start and session through `@internal/test-session`'s `fakeCore` and `conformanceAnswer`. A behaviour change in the guard breaks every adapter's test at once; a refactor breaks none.
- Almost no mocking: 2 files use `vi.mock`, 0 use `vi.fn`. DB tests run against a real per-suite Postgres (`tooling/test-postgres`).
- Type-level tests in 6 `*.test-d.ts` files say what must not compile.
- End-to-end: `tooling/e2e` generates installs for each stack and runs owner, guest, role, added-app and a11y journeys in Chromium, plus a production journey over https on Docker images.
- Coverage thresholds per package, with a ratchet (`tooling/repo-checks/src/check-coverage-thresholds.ts`). guard, hono and start sit at 100%.

Weaknesses:
- CI fails at this commit: `@internal/test-postgres` branches 48.64% against a 51% threshold (`tooling/test-postgres/vitest.config.ts:12`). The threshold was raised in `858aa47` from a number CI does not reproduce, and the same failure (earlier 24% vs 28%) has stood for 9 runs.
- Core's unit project covers only 5 files; its behaviour lives in 13 `*.db.test.ts` files that need Docker, so a Windows contributor's `pnpm check` exercises little of core.
- `@internal/e2e` has no coverage and its helpers cast freely (category 3), so the e2e harness itself is least checked.

To raise this by one point:
- Set `tooling/test-postgres/vitest.config.ts` thresholds from the CI run (statements, branches, functions, lines rounded down from the CI log), or make the uncovered branches in `tooling/test-postgres/src/clean-up.ts` and `watcher.ts` deterministic, so `check:all` is green on CI.
- Pull the pure parts of core's db-backed modules (for example access-code generation and session expiry maths in `packages/core/src/access-codes.ts` and `sessions.ts`) into functions with unit tests in `test:unit`, so `pnpm check` covers more of core without Docker.

## 9. Keeping standards up — 7/10

What they do well:
- Six custom ESLint rules, each with its own test file (`tooling/eslint/*.test.js`, 78 tests): `layer`, `core-schema`, `no-json-cast`, `no-silent-catch`, `one-problem-type`, `relative-import-extension`. Their messages name the rule or the doc to read.
- Fifteen repo-check suites run as tests (`tooling/repo-checks/src`): package graph, catalog, API reports, doc examples compile, glossary words, package scripts, published packs (publint, attw), coverage ratchet, commit subjects, PR ticket, renovate cap.
- Suppressions must give a reason and an unused one fails (`tooling/eslint/index.js:69-76`).
- Hooks: pre-commit lint-staged, commit-msg subject check (`.husky/`). CI checks subjects on every PR commit, coverage against base, changesets, and the PR's ticket (`.github/workflows/ci.yml:41-74`). A single `gate` job (`ci.yml:78-89`). CODEOWNERS. Renovate. AGENTS.md says every new layer rule ships with its lint rule.

Weaknesses:
- Nothing makes the gate binding. `gh api .../branches/main/protection` returns "Branch not protected". The docs say `gate` is "the one required check", but GitHub does not require it.
- In practice the gate is being bypassed. The last 10 CI runs on the ticket chain failed, including this exact commit, and the branches were merged into each other anyway (`026bb4e`, `1a00c97` are merges with red CI). A standard that fails and gets merged is not enforced.
- The coverage ratchet allows a threshold that CI cannot meet, because thresholds are raised from local runs.

To raise this by one point:
- Turn on branch protection for `main` requiring the `gate` check and a review, with "include administrators", and add a repo check or a scheduled workflow that fails when `gh api repos/RobertScholey98/robkit/branches/main/protection` shows the `gate` context missing.
- Fix the test-postgres threshold (category 8), and add a rule to `CONTRIBUTING.md` and `AGENTS.md` ("Branches and pull requests") that a stacked branch merges into its parent only with a green `gate`, then make `tooling/repo-checks/src/check-coverage-thresholds.ts` refuse a raise that the PR's own CI coverage artifact does not reach.

## 10. Nice to work in as a human — 8/10

What they do well:
- A README with a five-command quickstart and a mermaid diagram of an install (`README.md:9-50`).
- CONTRIBUTING with prerequisites, WSL steps, a gate table with timings, and a worked first change from ticket to PR (`CONTRIBUTING.md`, "A first change").
- `docs/architecture.md` (request flow, token flow, package map, "Where to look"), `docs/testing.md` ("When a test fails"), 12 one-page ADRs, two convention docs, and a README per package ending in "For contributors".
- One command to try a change as a user: `pnpm create-install` links an install to the checkout.
- Comments explain why throughout, for example `request-guard.ts:366-367` ("Not knowing who is asking isn't the same as nobody asking") and the JSDoc on `package-graph.js`.
- The docs compile: `tooling/repo-checks/src/doc-examples.ts` type-checks every `ts` fence.

Weaknesses:
- On Windows, `pnpm dev` and the Docker suites need WSL. Many contributors cannot see core's db-backed behaviour without it.
- A contributor's PR will currently fail CI for a reason that is not theirs (category 8).
- The spec is a Claude Doc outside the repo (`AGENTS.md:7`), and PRs must name a ticket file under `.scratch/` (`ci.yml:69-74`). An outside contributor with an idea but no ticket has no documented path.
- The cold `pnpm check` took 1 m 20 s here against CONTRIBUTING's "53 to 65 seconds", so the stated numbers are optimistic.

To raise this by one point:
- Add a "Without a ticket" section to `CONTRIBUTING.md` that says how an outside contributor proposes a change (open an issue, or add a `needs-triage` ticket under `.scratch/`), and let `tooling/repo-checks/src/check-pr-ticket.ts` accept a new `needs-triage` ticket in the same PR.
- Get CI green and keep it so (categories 8 and 9), then refresh the timing table in `CONTRIBUTING.md` from a measured cold run.

## Top 5 practices to copy

1. **One conformance table for every adapter.** `packages/guard/conformance.json` with `@robkit/guard/conformance` and `@internal/test-session`'s `fakeCore` / `conformanceAnswer`, run by `packages/hono/src/guarded.test.ts`, start and session. A new adapter gets the whole behaviour spec for free.
2. **One package graph feeding both lint and a repo check.** `tooling/eslint/package-graph.js` drives `tooling/eslint/layers.js` and `tooling/repo-checks/src/graph-check.ts`, which catches undeclared edges, dev-only imports in runtime code, cross-folder relative imports and cycles.
3. **Convention docs backed by custom lint rules that link back to them.** `docs/conventions/errors.md` and `input.md` are enforced by `tooling/eslint/no-silent-catch.js`, `one-problem-type.js` and `no-json-cast.js`, whose messages point at the doc.
4. **The guard's decision as a lookup table.** `packages/guard/src/guard.ts:95-121` maps rule kind by who is asking to an outcome, so every case is visible and the type checker proves the table complete.
5. **Generated API reports and compiled doc examples.** `packages/*/api-report.md` from `tooling/repo-checks/src/api-report.ts`, and `tooling/repo-checks/src/doc-examples.ts` type-checking every `ts` fence in the docs, so the public surface and its documentation cannot drift silently.
