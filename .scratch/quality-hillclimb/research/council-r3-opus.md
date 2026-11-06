# robkit quality report

Commit: 16a7a7b (checked out on branch t3/c5350e7b, same tree as 56-round-3). Scope: all nine published packages under `packages/` (core, create-robkit, dev, guard, hono, input, react, session, start), create-robkit's `templates/` (hub, admin, core-client, the two stacks), and `tooling/` (eslint, repo-checks, e2e, test-postgres, test-session, typescript). I read `.github/`, `.husky/`, the root configs, `AGENTS.md`, `CONTRIBUTING.md`, `GLOSSARY.md` and `docs/`. I skipped `.scratch/quality-hillclimb/` apart from the rubric, and did not run the Docker-backed suites (`*.db.test.ts`, e2e, test-postgres).

## Scores

| # | Category | Score | One-line reason |
| - | -------- | ----- | --------------- |
| 1 | Module boundaries | 8 | A package graph enforced by lint and a repo test, with API reports; but `@robkit/session` is a grab bag that the CLIs depend on for addresses and logging. |
| 2 | Public API design | 8 | Branded values only readers make, type tests and API reports; but input and session each export 33 declarations, and core's `createApp` drops the `Domain` brand. |
| 3 | Type safety at the edges | 9 | Zero casts, zero `any` and zero `@ts-ignore` in shipped non-test code, strictest tsconfig flags, readers at every boundary, all lint-enforced. |
| 4 | Naming and domain language | 8 | A glossary with avoid-words a test enforces; but one concept is "manifest", "declaration" and "declared app", and the package called session holds the request guard. |
| 5 | Simplicity | 7 | Small product packages and a table-driven guard; but heavy tooling, two 500-line e2e files and Coolify deploy code inside the scaffolder. |
| 6 | Consistency | 8 | One problem type, one `Report`, one `runCommand`, catalog-only versions; but five result shapes and a second, weaker lint config for shipped template code. |
| 7 | Error handling | 9 | Values for expected failures, `cause` for faults, three custom lint rules that really fire, and messages that say what to do. |
| 8 | Testing | 8 | Core tested over HTTP on real Postgres, adapter conformance JSON, type tests, a whole-stack and a production e2e, coverage ratchets; but create-robkit's unit tests take 75 s. |
| 9 | Keeping standards up | 8 | Eight tested custom lint rules, 13 repo checks, API reports, changeset, coverage, commit and ticket gates; but `main` has no branch protection, so none of it blocks a merge. |
| 10 | Nice to work in as a human | 8 | Every package has a README with a compiled example, a worked first change and measured gate times; but the full suite and `pnpm dev` need WSL on Windows, and three tooling packages have no README. |

## Measurements

| What | Command or method | Result |
| ---- | ----------------- | ------ |
| Fast gate | `pnpm install --frozen-lockfile && time pnpm check` (Git Bash, corepack shim on PATH) | Exit 0. 48 of 48 turbo tasks passed, 31 from cache. 1 m 32 s wall. Tree clean afterwards (`git status --short` empty). |
| Unit test counts and times | per-package Vitest summaries in the gate log | input 165 (3.3 s), guard 65 (3.0 s), session 147 (3.1 s), hono 28, start 29, react 9, dev 53 + 1 skipped (1.7 s), core 124 (2.8 s), eslint-config 112 (3.3 s), test-session 33, repo-checks 164 (49.3 s), create-robkit 216 (75.5 s). About 1,145 tests. |
| Lint rules fire | wrote an untracked `packages/hono/src/zz-probe.ts` with a core import, a relative import into core, `JSON.parse(...) as T`, an empty `catch {}`, `throw new Error("failed")` and `as unknown as T`; ran `npx eslint` on it; deleted it | 9 errors: `robkit/layer` (twice), `robkit/relative-import-extension`, `robkit/no-json-cast`, `no-unsafe-type-assertion` (twice), `robkit/no-silent-catch`, `no-empty`, `robkit/no-bare-error`. |
| Branch protection | `gh api repos/RobertScholey98/robkit/branches/main/protection`; `.../rulesets`; `.../rules/branches/main` | 404 "Branch not protected"; `[]`; `[]`. The repo is public. |
| Packages | `ls packages tooling` | 9 published, 6 private tooling workspaces. |
| Source size (non-test ts/tsx) | `git ls-files` + `wc -l` per workspace | core 2,322; create-robkit 2,702 (plus 3,168 in templates); dev 952; guard 313; hono 49; input 566; react 48; session 1,138; start 75; e2e 2,210; repo-checks 2,297; test-postgres 336; test-session 361; eslint rules 1,731 (incl. their tests). |
| Test size | same | about 15,800 lines of tests against about 13,200 lines of non-template source. 78 test files in `packages/` outside templates. |
| Largest non-test files | `wc -l | sort -rn` | `tooling/e2e/src/production-stack.ts` 541, `tooling/e2e/src/install-journeys.ts` 498, `packages/create-robkit/src/coolify-deploy.ts` 380, `templates/base/apps/admin/src/client/Admin.tsx` 354, `tooling/repo-checks/src/glossary.ts` 343. |
| `any` in non-test source | grep `: any`, `<any>`, `as any`, `any[]` | 0 (one hit is the word "any" in a comment). |
| Casts in non-test source | grep ` as X` on code lines, excluding `as const` and import renames | 0 in shipped code. 5 in test helpers under `src/test/` (`packages/core/src/test/fresh-app.ts:62`, `packages/create-robkit/src/test/fake-coolify.ts:72,84,127,135`). 19 in `*.test.ts`. |
| `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | grep | 0 in shipped code, apart from the generated `routeTree.gen.ts`. 9 `@ts-expect-error` in type tests and one in `packages/dev/src/provision.db.test.ts:96`, all deliberate. |
| `eslint-disable` | grep | 3 in shipped code, each with a reason after `--` (`packages/core/src/database.ts:11`, `packages/input/src/app-env.ts:70`, `packages/input/src/problem.ts:34`), plus the generated route tree. |
| Non-null assertions `x!.` | grep | 0. |
| Errors | grep in non-test source | `throw new Error` 41, `new CommandProblem` 51, 3 error classes (`CommandProblem`, `AccessRuleError`, `CoreUnreachableError`), 50 `catch` sites. |
| Mocks | grep `vi.mock`, `vi.spyOn`, `toHaveBeenCalled` | 11 uses across all tests; `vi.mock` in 2 files. |
| Exported declarations | count in each `api-report.md` | input 33, session 33, dev 16, guard 15, create-robkit 12, core 11, hono 4, start 4, react 1. |
| External dependencies | `pnpm-workspace.yaml` catalog, `catalogMode: strict` | 44 catalog entries, many used only by templates. Core's runtime deps: drizzle-orm, hono, jose, postgres. |
| TODO / FIXME / HACK | grep | 0. |

## 1. Module boundaries — 8/10

What they do well:
- One file lists every allowed workspace edge, split into runtime and dev edges (`tooling/eslint/package-graph.js:27-101`). `tooling/repo-checks/src/graph-check.ts` fails on an undeclared dependency or import, a dev-only edge used at runtime, an edge no manifest has, and a cycle.
- The layer ESLint rule builds its "never imports core" rows from that same graph (`tooling/eslint/layers.js:43-67`), so the rule and the graph cannot disagree. My probe file in `@robkit/hono` got "Layer rule: @robkit/hono never imports @robkit/core. Code reaches core over HTTP only" for both a package import and a relative import into `packages/core`.
- Entry files are short and explicit re-export lists. Core exports 7 names (`packages/core/src/index.ts:1-7`), hono 2, start 2, react 1.
- Each published package has an `api-report.md` generated from its built declarations, and `api-report.test.ts` fails when the declarations drift.
- The pure guard is its own package with one runtime dependency (`@robkit/input`), and the HTTP glue sits one layer up in session.

Weaknesses:
- `@robkit/session` mixes five concerns behind three entry points: token reading and minting helpers, the HTTP `requestGuard`, install addresses (`./addresses`), the lapsed-session signal (`./lapsed`), and the `Report` logging type (`packages/session/src/report.ts`). As a result `@robkit/dev` depends on "session" only for `install`, `defaultDevPort`, `defaultDomain` and `reportToConsole` (`packages/dev/src/apps.ts:15`, `packages/dev/src/env.ts:13`, `packages/dev/src/run-command.ts:1`), and create-robkit uses it mostly for addresses (`packages/create-robkit/src/deployment.ts:8`, `coolify-deploy.ts:4`, `robkit-command.ts:18`). The graph edge `@robkit/dev -> @robkit/session` exists for reasons the package name does not suggest.
- `@robkit/input`'s entry exports 33 declarations spanning generic helpers (`isRecord`, `readSet`), env readers, slugs and the manifest format. You cannot understand it from the entry alone.
- create-robkit holds a Coolify API client and deploy loop (`coolify-api.ts`, `coolify-config.ts`, `coolify-deploy.ts`, about 700 lines) beside the scaffolder. Deploy is a separate concern from generating an install.

Worth copying into robkit:
- Keep the single `package-graph.js` that both a lint rule and a repo test read. That pattern is already the right one.

To raise this by one point:
1. Move `packages/session/src/addresses.ts` and `packages/session/src/report.ts` to `@robkit/input` (or a new zero-dependency `@robkit/install` package), re-point the imports listed above, and drop the `@robkit/dev -> @robkit/session` and `create-robkit -> @robkit/session` edges from `tooling/eslint/package-graph.js` where nothing else needs them (create-robkit's `check.ts` still needs `sessionCookie`). Update `api-report.md` files with `api:update`.
2. Split `@robkit/input`'s entry: keep readers and `InputProblem` at `.`, and move the manifest format (`packages/input/src/manifest.ts`) to a `./manifest` subpath so the root export list shrinks to the reading primitives.

## 2. Public API design — 8/10

What they do well:
- Branded types with readers as the only constructors: `RoleId` and `CodeId` (`packages/guard/src/guard.ts:10-16`), `Slug`, `Domain`, `CoreOrigin` in input. `robkit/no-brand-cast` forbids casting to them even in tests, and `@internal/test-session` gives tests builders instead.
- Adapter-facing packages carry `*.test-d.ts` files that pin what must not compile, for example `packages/guard/src/guard.test-d.ts:46-75` ("A roles rule needs the role ids it lets in", "An open rule takes no roles").
- Option objects are documented field by field, including why (`packages/session/src/request-guard.ts:22-46`: `core` comes from config "never the request's Host, so a request can't choose whose keys the app trusts").
- `guard/conformance.json` is a published, data-only contract a new adapter runs to prove it decides the same way.
- API reports make every public change visible in review.

Weaknesses:
- The brand is dropped at core's own front door. `readCoreConfig` returns `domain: Domain` (`packages/core/src/env.ts:21`) but `createApp` takes `domain: string` (`packages/core/src/app.ts:22`), so a caller can pass `"https://x.com/"` and it compiles.
- `RequestDecision` is `{ viewer } | { response }` and callers discriminate with `"response" in decision` (`packages/hono/src/guarded.ts:24`), while every other union in the codebase carries a tag (`outcome`, `kind`, `state`).
- input and session each export 33 declarations; session spreads them over `.`, `./addresses` and `./lapsed`. Names like `sessionTokensIn`, `appSessionUrl`, `appRefreshPath`, `coreAudience` are hard to choose between without the README.

Worth copying into robkit:
- Pair every branded public type with a `*.test-d.ts` case that a raw string fails to compile.

To raise this by one point:
1. Change `CoreOptions.domain` in `packages/core/src/app.ts:22` to `Domain` from `@robkit/input`, thread it through `packages/core/src/access-codes.ts:63,85,138,155`, and add a `packages/core/src/app.test-d.ts` with `// @ts-expect-error` on `createApp({ domain: "robkit.dev", ... })`.
2. Tag `RequestDecision` in `packages/session/src/request-guard.ts` as `{ outcome: "serve"; viewer } | { outcome: "answer"; response }`, and update `packages/hono/src/guarded.ts` and `packages/start/src/guarded.ts` to switch on it.

## 3. Type safety at the edges — 9/10

What they do well:
- `tooling/typescript/base.json` sets `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` and `erasableSyntaxOnly`, and ESLint runs `strictTypeChecked` plus `stylisticTypeChecked` (`tooling/eslint/index.js:36-37`).
- Measured: 0 `any`, 0 casts, 0 `@ts-ignore`, 0 non-null assertions in shipped non-test code. Casts exist only in test helpers under `src/test/`.
- `@typescript-eslint/no-unsafe-type-assertion` and `robkit/no-json-cast` stop casts outside tests (`tooling/eslint/index.js:45-58`); my probe confirmed both fire on `JSON.parse(text) as Thing`.
- Every outside value goes through a reader returning `T | InputProblem`: env (`packages/input/src/env.ts`), JSON (`packages/input/src/json.ts:7-17`, which wraps the parse in `{ json }` so a payload with an `error` field cannot be mistaken for a problem), manifests (`packages/input/src/manifest.ts`), config files (`packages/create-robkit/src/coolify-config.ts`). `readCoreConfig` collects every env problem at once with `allProblems` (`packages/core/src/env.ts:36-51`).
- `problem-checks.test.ts` walks the TypeScript syntax tree to fail `typeof x !== "string"` on a reader's result, so the one checking idiom is enforced.

Weaknesses:
- Inside core, brands give way to `string`: `slug: string` in `accessOf` and `setAccess` (`packages/core/src/apps.ts:160,180`), with the route passing `c.req.param("slug")` straight in (`packages/core/src/routes/apps.ts:30,39`); `domain: string` as above.
- `InputProblem` is structural (`{ readonly error: string }`, `packages/input/src/problem.ts:5-11`). A reader whose success type is an object with a string `error` field would be misread by `isProblem`. Nothing today does, but nothing stops it either.

Worth copying into robkit:
- The `{ json: unknown } | InputProblem` wrapper in `parseJson`, which keeps untrusted payloads from colliding with the problem shape.

To raise this by one point:
1. Read the slug at core's route boundary with `readSlug` in `packages/core/src/routes/apps.ts`, answer 404 on a problem, and change `accessOf`/`setAccess` in `packages/core/src/apps.ts` to take `Slug`.
2. Make `InputProblem` nominal: add a `declare const problemBrand: unique symbol` property in `packages/input/src/problem.ts`, build problems only through a `problem(message)` helper, and have `isProblem` check that. Update the readers that build `{ error: ... }` literals.

## 4. Naming and domain language — 8/10

What they do well:
- `GLOSSARY.md` defines each term with what to avoid, records resolved ambiguities with dates (for example "session" once meaning three things, resolved 2026-11-06), and `tooling/repo-checks/src/glossary.ts` fails an avoided word in source, READMEs and docs, with a reasoned exception list that also fails on stale entries.
- Code follows the glossary closely: `Viewer` vs `Profile` are separate types and JSON keys; core's session rows live in `packages/core/src/session-store.ts` exactly as the glossary says.
- File names match concepts: `access-codes.ts`, `roles.ts`, `signing-key.ts`, `rate-limit.ts`, `mint-token.ts` in core.
- Doc comments use the domain words consistently ("A role's id, as core stores it. Only a reader makes one").

Weaknesses:
- The glossary calls it a **Manifest**, but the code has `AppManifest` and `readAppManifest` in dev (`packages/dev/src/apps.ts:38,52`), and `AppDeclaration`, `DeclaredApp`, `DeclaredAccess`, `readAppDeclaration`, `appDeclarationJson` in input (`packages/input/src/manifest.ts`). Measured: 11 uses of `AppDeclaration`, 9 of `DeclaredApp`, 4 of `AppManifest`. A newcomer searching for "manifest" in input finds a file named `manifest.ts` whose types are all "declaration".
- The glossary says an app never sees a **Session**, yet the package apps import to run their guard is `@robkit/session`, and it also holds addresses and logging.
- `guard`, `requestGuard` and `guarded` are three functions in three packages; the distinction is learnable but not guessable.

Worth copying into robkit:
- Keep the dated "Flagged ambiguities" list; it is the cheapest way to stop a word drifting back.

To raise this by one point:
1. Pick one word for the manifest concept. Rename `AppDeclaration` to `AppManifest`, `readAppDeclaration` to `readAppManifest`, `appDeclarationJson` to `appManifestJson` in `packages/input/src/manifest.ts`, and rename dev's file-level type in `packages/dev/src/apps.ts` to `AppManifestFile` (or fold it into input's). Add "declaration" to the Manifest entry's _Avoid_ list in `GLOSSARY.md` so the glossary test enforces it.
2. Add a "Package names" subsection to `GLOSSARY.md` that says what `@robkit/session` holds and why it is named after session tokens, or rename it (`@robkit/app-session`) when its addresses and `Report` move out per category 1.

## 5. Simplicity — 7/10

What they do well:
- The guard is a lookup table (`packages/guard/src/guard.ts:111-136`), not branching code; 313 lines for the whole package.
- Adapters are thin: hono's `guarded` is 27 lines (`packages/hono/src/guarded.ts`), start's 75 lines, react's 48.
- A request traces in about four files: adapter, `request-guard.ts`, `core-access.ts` / `refresh-protocol.ts`, `guard.ts`. `docs/architecture.md` draws the same path.
- Core's runtime dependency list is four libraries. No TODOs, and knip passes with a commented config.

Weaknesses:
- Tooling is as large as the product it guards: repo-checks 2,297 lines, eslint rules about 900 lines, e2e 2,210 lines, against about 7,000 lines of non-template product source in `packages/`. Each piece is justified, but a contributor has a lot of machinery to understand.
- `tooling/e2e/src/production-stack.ts` (541 lines) and `tooling/e2e/src/install-journeys.ts` (498 lines) are the largest files in the repo.
- Session has 13 source files for 1,138 lines, including small single-purpose modules (`guard-http.ts`, `lapsed.ts`, `report.ts`, `app-session.ts`) that each serve one or two callers.
- create-robkit carries a full Coolify deploy path (`coolify-api.ts`, `coolify-config.ts`, `coolify-deploy.ts`) in the same package as scaffolding.
- The template lint config re-implements three custom rules as `no-restricted-syntax` selectors (`packages/create-robkit/templates/base/eslint.config.js:6-37`), a second copy of the same logic.

Worth copying into robkit:
- Table-driven decisions like `outcomes` in `guard.ts`, where the whole policy reads as one literal.

To raise this by one point:
1. Split `tooling/e2e/src/production-stack.ts` into the stack's lifecycle (build, start, stop) and its assertions, and `tooling/e2e/src/install-journeys.ts` into one file per journey, each under about 250 lines.
2. Move `coolify-api.ts`, `coolify-config.ts` and `coolify-deploy.ts` out of `packages/create-robkit/src` into a `deploy/` folder with one entry (`deploy/index.ts`) that `robkit-command.ts` imports, so the scaffolder's own files read on their own.
3. Fold `packages/session/src/report.ts` and `addresses.ts` out of session (category 1), and inline `guard-http.ts` into `request-guard.ts` if it has no other caller.

## 6. Consistency — 8/10

What they do well:
- One problem type for failed reads, checked one way (`isProblem`), enforced by `robkit/one-problem-type` and `problem-checks.test.ts`.
- One `Report` signature for every fault printer (core's `logError`, the guard's `onUnavailable`, `runCommand`), defaulting to `reportToConsole`.
- All three command lines go through `runCommand` and throw `CommandProblem` (51 sites).
- Every external version sits in the strict catalog; `catalog.test.ts` fails a pinned version and an unused entry.
- Every package has the same scripts, checked by `package-scripts.test.ts`; relative imports all use `.ts`, enforced by `robkit/relative-import-extension`.

Weaknesses:
- Five result shapes for "it worked or it didn't": `T | InputProblem` (readers), `{ outcome: ... }` (guard, `claimInstall`, `setAccess`), `{ ok: true, value } | { ok: false, error }` (the templates' `callCore`, per `docs/conventions/errors.md`), `{ viewer } | { response }` checked with `in` (`packages/session/src/request-guard.ts`), and `{ json } | InputProblem` (`parseJson`). Each is defensible alone; together they are five idioms.
- The 3,168 lines of shipped template code (hub, admin, core-client, stacks) are linted by `packages/create-robkit/templates/base/eslint.config.js`, which lacks `robkit/no-silent-catch`, `robkit/no-bare-error`, `preserve-caught-error`, `require-description` and `reportUnusedDisableDirectives`. So `throw new Error("admin's page has no #root or core origin")` in `packages/create-robkit/templates/base/apps/admin/src/client/main.tsx:10` passes, while the same line in `packages/` would fail.

Worth copying into robkit:
- A single named function type (`Report`) for "tell someone about a fault", with one default.

To raise this by one point:
1. Ship robkit's lint rules to installs: publish the rule files in `tooling/eslint/*.js` as part of an installable config (for example vendor them into `templates/base/tooling/eslint/` at generation time, as `vendor.ts` does for packages), and replace the selectors in `templates/base/eslint.config.js` with the real rules plus `preserve-caught-error`, `no-silent-catch`, `no-bare-error` and the comment rules.
2. Write down the result-shape rule in `docs/conventions/errors.md` ("a reader returns `T | InputProblem`; any other outcome union is tagged with `outcome`"), and change `RequestDecision` and `callCore`'s result to an `outcome` tag to match.

## 7. Error handling — 9/10

What they do well:
- `docs/conventions/errors.md` sorts failures into expected values and faults with `cause`, says what each boundary does, and gives a deadline table for every outbound request.
- The rules are machine-enforced and work: my probe got `robkit/no-silent-catch` on `catch {}` and `robkit/no-bare-error` on `throw new Error("failed")`, each with a message pointing at the convention doc (`tooling/eslint/no-bare-error.js`, `no-silent-catch.js`).
- Messages tell the user what to do: "ROBKIT_DOMAIN is \"...\", which isn't a domain. Set it to the install's domain alone, such as robkit.dev, with no scheme, port or path." (`packages/input/src/env.ts:133`); "COOLIFY_URL is \"...\", which isn't a web address. Set it to your Coolify's address" (`packages/create-robkit/src/env.ts:47`).
- Core's single `app.onError` logs the cause with a request id and returns only the id (`packages/core/src/app.ts:78` onward). The guard answers 503 rather than treating a fault as signed out, and `GuardFault` tags what failed (`packages/session/src/request-guard.ts:55-63`).
- Cleanup collects every failure and rethrows one or an `AggregateError`; only `ESRCH` counts as "already gone".

Weaknesses:
- 41 `throw new Error` in non-test source carry their meaning only in text. Callers can tell apart only `CoreUnreachableError` and `AccessRuleError`; core's faults (`packages/core/src/database.ts:36`, `signing-key.ts:17`, `access-codes.ts:175`) are plain `Error`s.
- Template code escapes the rules (see category 6), so the hub's `catch (error) { return <Unreachable reason={String(error)} /> }` (`templates/base/apps/hub/src/App.tsx:19-21`) shows a raw error string to the person instead of a sentence that says what to do.

Worth copying into robkit:
- A `no-bare-error` lint rule that allows a fixed message only with `cause`, which forces every fault to name what was tried.

To raise this by one point:
1. Bring template code under the same rules (category 6, item 1), then fix what it finds, starting with `templates/base/apps/hub/src/App.tsx:19-21` (show a sentence such as "Can't reach core. Check that pnpm dev is running." and report the cause) and `templates/base/apps/admin/src/client/main.tsx:10`.

## 8. Testing — 8/10

What they do well:
- Core is tested through its HTTP interface on a real Postgres: `postJson(app, "/login", rob)` and assertions on status, JSON body and cookie attributes (`packages/core/src/login.db.test.ts:13-35`). A refactor of core's internals would not change these tests.
- `packages/guard/conformance.json` is one decision table that every adapter's tests run, so hono, start and the guard cannot disagree.
- Type tests (`*.test-d.ts`) run with `vitest run --typecheck` for the adapter-facing packages.
- An end-to-end path exists twice: the whole-stack Playwright journey on every CI run, and a production test that builds Docker images and runs over https (`.github/workflows/production.yml`).
- Coverage thresholds are high (core: statements 96, branches 96, functions 91, lines 97, `packages/core/vitest.config.ts`), CI fails a PR that lowers one, and `check-coverage-ratchet.ts` fails one more than 2 points under the measurement.
- Very few mocks: 11 spy or mock uses in the whole suite. Fakes are real servers (`packages/create-robkit/src/test/fake-coolify.ts`, `@internal/test-session`'s fake core).

Weaknesses:
- Slow unit tier: create-robkit's `test:unit` took 75.5 s and repo-checks' 49.3 s on this machine, with single tests at 7 to 13 s (`deploys nothing until COOLIFY_URL is set`, 13.4 s). Everything else finishes in about 3 s.
- The React UI in templates (`Admin.tsx` 354 lines, `forms.tsx` 221, `apps.tsx`, `roles.tsx`) has no component tests; only the e2e journey reaches it, so a UI regression surfaces only in the slowest tier.
- On Windows, `pnpm check` cannot run any `*.db.test.ts`, so core's most valuable tests are Linux-only. A flake fix for the dev runner just landed (commit 4b3bbf4), a sign the process tests are timing-sensitive.

Worth copying into robkit:
- A shared conformance table that each adapter must pass.

To raise this by one point:
1. Find what makes `packages/create-robkit/src/*.test.ts` slow (likely spawning `node` and running `pnpm`/Prettier per test) and share one generated install per file with `beforeAll`, or move the spawn-the-CLI tests to the `test` script and keep `test:unit` to in-process calls. Target under 20 s for create-robkit's `test:unit`.
2. Add component tests for the admin and hub screens in `templates/base/apps/admin/src/client/` and `templates/base/apps/hub/src/` with Testing Library against a fake `callCore`, covering the access-code and role forms' success and error states.

## 9. Keeping standards up — 8/10

What they do well:
- Eight custom ESLint rules, each with its own test file (`tooling/eslint/*.test.js`, 112 tests), plus `suppressions.test.js`. `require-description` and `reportUnusedDisableDirectives: "error"` make every suppression explain itself and go when unused (`tooling/eslint/index.js:79-86`).
- 13 repo checks as tests (`tooling/repo-checks/README.md` table): API reports, catalog, changeset config, CLI scripts tested by spawn, coverage config, doc examples compiling, glossary words, package graph, package scripts, problem checks, packed exports with publint and Are the Types Wrong, Renovate settings. Each failure names the file and fix, and exception lists fail when stale.
- CI's PR job checks every commit subject, coverage thresholds against the base, `changeset status`, and that the PR body names a ticket file that exists (`.github/workflows/ci.yml:67-84`). A `gate` job rolls everything into one result.
- Husky runs ESLint fixes and Prettier on staged files and checks the subject at commit time (`.husky/pre-commit`, `.husky/commit-msg`). CODEOWNERS, a PR template, Renovate and changesets are all present.
- AGENTS.md states each rule next to the check that enforces it ("A new rule goes in with its lint rule, in the same commit").

Weaknesses:
- Nothing blocks a merge. `gh api repos/RobertScholey98/robkit/branches/main/protection` returns 404 "Branch not protected", and the repo has no rulesets. AGENTS.md says "CI's `gate` job is the one required check", but it is not required, CODEOWNERS review is not required, and a direct push to `main` skips the PR job entirely. Every check above is advisory at merge time.
- Shipped template code is held to a weaker lint config (category 6).
- The commit-subject check is a heuristic ("first word ends in ed or ing"), which lets non-imperative subjects through and could refuse a valid one ("Embed ...", "Bring ...").

Worth copying into robkit:
- The "every exception list fails on an entry nothing needs" pattern across glossary, package scripts and graph checks.

To raise this by one point:
1. Add a ruleset on `main` (Settings, Rules, or `gh api -X POST repos/RobertScholey98/robkit/rulesets`) that requires a pull request, requires the `gate` status check, requires CODEOWNERS review, and blocks force pushes and deletion. Then add a repo check (`tooling/repo-checks/src/branch-rules.ts`, run in the PR job with `GH_TOKEN`) that fails if the ruleset no longer requires `gate`, so the claim in AGENTS.md is itself checked.
2. Lint the templates with robkit's real rules (category 6, item 1).

## 10. Nice to work in as a human — 8/10

What they do well:
- Every published package has a README with purpose, a compiled example, exports and its layer rule; five end with "For contributors" (`packages/guard/README.md`). `doc-examples.test.ts` compiles every `ts` fence, so examples cannot rot.
- `CONTRIBUTING.md` covers WSL setup step by step, both gates with measured times and the commit they were measured at, a worked first change, running one package or one test, and troubleshooting.
- `docs/architecture.md` has the install diagram and a request sequence diagram, and links twelve ADRs in `docs/adr/`.
- One command makes a working install linked to the checkout: `pnpm create-install ../my-install --stack start`, then `pnpm dev`.
- Comments explain why, not what (`packages/core/src/app.ts:44`: "An Origin that isn't a URL names no host, so CORS refuses it."; `tooling/eslint/index.js:46-49`).
- Script names say what they do: `check`, `check:all`, `create-install`, `api:update`, `test:production`.

Weaknesses:
- On Windows, `pnpm dev` and the database tests need WSL and Docker; native Windows contributors get lint, types and unit tests only.
- `pnpm check` takes about 90 s here (70 s claimed cold), most of it in two packages' tests (category 8), which slows the inner loop.
- `tooling/e2e`, `tooling/test-postgres` and `tooling/test-session` have no README; `docs/testing.md` covers e2e, but test-session's builders (`slug`, `aCodeId`, `aRoleId`, `aViewer`, the fake core) are documented only in AGENTS.md.
- A PR must name a ticket file under `.scratch/`; an outside contributor has to learn the ticket workflow before the first change, though CONTRIBUTING explains how.

Worth copying into robkit:
- Recording measured gate times with the commit and machine they were measured on.

To raise this by one point:
1. Add `tooling/test-session/README.md` (each builder, the fake core and an example test), `tooling/test-postgres/README.md` (how a suite gets its Postgres and how to debug one that won't start) and `tooling/e2e/README.md` (pointing at `docs/testing.md` and listing the journeys and their files).
2. Cut `pnpm check` to under 45 s by fixing create-robkit's unit test time (category 8, item 1) and by giving `@internal/repo-checks#test:unit` narrower `inputs` in `turbo.json` so a warm run hits the cache when only one package changed.

## Top 5 practices to copy

1. One package graph read by both a lint rule and a repo test, with runtime and dev edges separate and cycle detection (`tooling/eslint/package-graph.js`, `tooling/eslint/layers.js:43-67`, `tooling/repo-checks/src/graph-check.ts`).
2. Custom lint rules that encode the error convention and point at the doc in their message (`tooling/eslint/no-bare-error.js`, `no-silent-catch.js`, `no-json-cast.js`), plus `require-description` and `reportUnusedDisableDirectives` for suppressions (`tooling/eslint/index.js:79-86`).
3. Branded values that only readers build, a lint ban on casting to them even in tests, and test builders in a shared package (`packages/guard/src/guard.ts:10-16`, `tooling/eslint/no-brand-cast.js`, `tooling/test-session/src/index.ts`).
4. Doc examples compiled against the built packages, and API reports diffed in review (`tooling/repo-checks/src/doc-examples.ts`, `packages/*/api-report.md`, `tooling/repo-checks/src/api-report.ts`).
5. Exception lists that fail when an entry is no longer needed (`tooling/repo-checks/src/glossary.ts`, `tooling/repo-checks/src/package-scripts.ts`).
