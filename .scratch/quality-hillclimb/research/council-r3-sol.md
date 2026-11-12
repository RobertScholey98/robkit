# robkit quality report

Commit: 16a7a7bde1434d0330fdf13bae2cab3da37902b2. Scope: all nine published package entry points and manifests; sampled implementations across input, guard, session, both server adapters, react, core, dev and create-robkit; generated hub/admin/core-client and stack templates; shared TypeScript/ESLint configuration; repository checks; CI, hooks, contributor docs and the kit map. Read selected unit, type, database and browser journey tests. Skipped exhaustive inspection of every test, migration and UI component. Did not run Docker-backed suites. Read only rubric.md under .scratch/quality-hillclimb, and no earlier scores or reports. Scores are independent, on the rubric's absolute scale.

## Scores

| # | Category | Score | One-line reason |
| --- | --- | --- | --- |
| 1 | Module boundaries | 9 | Real package graph and thin adapters; core's connection abstraction still exposes implementation machinery. |
| 2 | Public API design | 8 | Small, documented interfaces, but domain/port validation and database lifetime remain caller responsibilities. |
| 3 | Type safety at the edges | 9 | Strict settings and cast-free runtime code; a few public inputs bypass validated types or have non-total readers. |
| 4 | Naming and domain language | 9 | Exceptionally coherent vocabulary with executable checks; the hub still calls a wire answer Session. |
| 5 | Simplicity | 8 | Small modules and few runtime dependencies; browser boundary helpers and deployment records retain unnecessary duplication or weak structure. |
| 6 | Consistency | 8 | Shared conventions dominate, but generated browser readers and lint policy differ from workspace code. |
| 7 | Error handling | 8 | Useful command problems, preserved causes and request IDs; default browser diagnostics and request deadlines have gaps. |
| 8 | Testing | 8 | Extensive unit, type, packaging and browser coverage; some journeys depend on earlier tests and UI checks remain structural. |
| 9 | Keeping standards up | 9 | An unusually thorough executable standards system, with remaining gaps around generated-code policy and deadlines. |
| 10 | Nice to work in as a human | 8 | Excellent navigation and contributor guidance; template development still needs a costly generated-install loop. |

## Measurements

- `git rev-parse HEAD` confirmed the exact commit above. `git status --short` was empty before review and after the checks. No tracked file was edited.
- In Git Bash, prepended the brief's scratchpad/bin directory to PATH and ran `pnpm install --frozen-lockfile`, then `pnpm check`. Installation passed in 23.4 seconds. The check passed: 48/48 tasks, 46 cached, Turbo time 57.332 seconds.
- Ran `pnpm check --force` with the same PATH because cached logs named another worktree. It passed: 48/48 tasks, zero cached, Turbo time 59.038 seconds. Prettier and knip passed in both runs. The forced run reported 100 test files, 1,145 passed tests and one skipped test across the top-level tasks, including type tests. Nested generated-install tests also passed inside create-robkit's install-checks test.
- Full forced-run output is alongside this report in `council-r3-sol-check.log`. No Docker-backed command was run. Browser journeys and CI configuration are source-inspection evidence, not locally verified end-to-end execution.
- Enumerated tracked files with `git ls-files` and parsed TypeScript syntax with the installed TypeScript compiler API. Published non-test source means `packages/*/src/**/*.ts(x)`, excluding test files and src/test helpers: 86 files, 7,843 newline-split lines, zero explicit any keywords, zero non-const type assertions, zero non-null assertions, zero @ts-ignore/@ts-nocheck comments, three eslint-disable occurrences. Twelve `as` expressions are all `as const`.
- Separately scanned template JS/TS/TSX, excluding test files, fake-core.ts and generated routeTree.gen.ts: 58 files, 3,281 lines, zero explicit any keywords, zero non-const assertions, zero non-null assertions, zero eslint-disable occurrences. Counts describe syntax, not proof of runtime correctness.
- Nine published packages, six private tooling packages, plus the root workspace. Seven distinct external runtime dependencies across published manifests: @clack/prompts, drizzle-orm, hono, jose, postgres, prettier and yaml. Eleven across all workspace manifests, including ESLint tooling dependencies. Templates have their own dependency set and are outside these dependency counts.
- Tracked workspace test inventory: 119 *.test.ts/tsx/js files, of which 18 are *.db.test.ts; eight additional *.test-d.ts files. These inventory numbers exclude template tests.
- Largest published runtime files: coolify-deploy.ts 381 lines; session-store.ts 297; check.ts 291; apps.ts 238; robkit-command.ts 237. Largest scanned template source: admin/src/client/Admin.tsx 355 lines.
- Forced-run statement/branch coverage: guard 100/100%; input 100/97.98%; session 97.97/94.17%; hono and start 100/100%; react 100/83.33%; create-robkit 73.91/66.97%; repo-checks 96.96/88.79%. Core/dev unit projects do not establish their full database-backed coverage.
- Direct Node source probes: `readRoleId(12n)` throws TypeError rather than returning InputProblem; function and symbol inputs produce messages saying undefined. `install({ domain: 'bad/path', port: 70000 })` accepts the options without validation. These are robustness/API findings, not claims of an exploitable HTTP vulnerability.

## 1. Module boundaries: 9/10

What they do well:
- `tooling/eslint/package-graph.js` explicitly separates runtime and development edges. `tooling/repo-checks/src/graph-check.ts:94` checks manifests against it; importProblems checks runtime use of development dependencies, and cycles checks both edge kinds.
- `tooling/eslint/layers.js:95` keeps framework imports out of session/guard/input and Node/network I/O out of guard/input. Core-forbidding rows are generated from the package graph rather than separately maintained lists.
- `packages/hono/src/guarded.ts:23` and `packages/start/src/guarded.ts:39` delegate request decisions to one session requestGuard. Neither reimplements authorization or imports core.

Weaknesses:
- `packages/core/src/database.ts:11` names the whole Drizzle connection with an extending interface. That shortens API reports but does not hide the connection's capabilities. The public entry exports Database and SigningKey, so the embedding interface still requires understanding storage and key setup, not just HTTP app creation.

Worth copying into robkit:
- Preserve the graph-derived lint rows and the separate manifest/import/cycle checks when adding packages.

To raise this by one point:
- In `packages/core/src/database.ts`, `packages/core/src/index.ts` and `packages/core/README.md`, expose a deliberate core lifecycle handle that owns migration/key initialization/connection shutdown. Keep raw query capabilities internal unless embedding consumers demonstrably need them; update `packages/core/api-report.md` accordingly.

## 2. Public API design: 8/10

What they do well:
- Hono's entry exports guarded, its options/environment and Viewer; react's entry exports one function. Session's shared request decision is a useful Response-or-Viewer union (`packages/session/src/request-guard.ts:85`).
- Guard options require Slug and CoreOrigin. `packages/hono/src/guarded.test-d.ts:22` actually rejects plain strings, missing core and a manifest rule where a resolved rule belongs.
- Nine API reports and packed-package checks make exports reviewable and exercise actual distribution targets (`tooling/repo-checks/src/published.test.ts:33`).

Weaknesses:
- `packages/session/src/addresses.ts:46` accepts arbitrary string domains and number ports, although Domain already exists. Invalid options fail later or create malformed addresses. `packages/core/src/app.ts:22` also accepts an unvalidated domain.
- `packages/core/src/database.ts:19` returns a connection with no explicit, documented core-level close operation. Consumers must know the underlying connection's API to release it.

Worth copying into robkit:
- Extend the adapter style of a small entry and negative compilation tests to core's embedding API.

To raise this by one point:
- Require Domain in InstallOptions and CoreOptions in `packages/session/src/addresses.ts` and `packages/core/src/app.ts`; validate or brand ports at construction and add negative cases to `packages/session/src/addresses.test-d.ts`.
- Add and document an explicit database shutdown operation in `packages/core/src/database.ts`, its public entry, README and API report, with a lifecycle test.

## 3. Type safety at the edges: 9/10

What they do well:
- `tooling/typescript/base.json:7` enables strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes and noImplicitOverride. Runtime syntax measurements are unusually clean.
- `packages/input/src/env.ts:123` and :160 produce branded Domain/CoreOrigin values from environment input. `packages/guard/src/guard.ts:93` uses explicit session states rather than optional fields with implicit combinations.
- `tooling/eslint/index.js` enables strict type-aware rules, unsafe-assertion rejection and custom JSON/brand-cast rules. Guard brands also have dedicated builders in `tooling/test-session/src/brands.ts`.
- Core schema constraints complement TypeScript: the singleton owner, access-code shape and role foreign keys are executable database constraints (`packages/core/src/schema.ts`).

Weaknesses:
- Brands are not carried consistently into address/core construction, as described in category 2.
- `packages/guard/src/guard.ts:27` JSON-stringifies arbitrary unknown values to build a rejection message. A BigInt or circular object makes these exported readers throw before they can return their declared failure value. JSON-origin inputs avoid those particular cases, but the public signature promises unknown.

Worth copying into robkit:
- Keep validation constructors and negative compilation tests paired with every new trusted boundary type.

To raise this by one point:
- Make shown in `packages/guard/src/guard.ts` total for unknown values, with bounded safe descriptions; add BigInt, symbol, function and circular-object cases in `packages/guard/src/guard.test.ts`.
- Complete the Domain propagation in the address/core APIs listed in category 2, rather than discarding the brand after environment parsing.

## 4. Naming and domain language: 9/10

What they do well:
- `GLOSSARY.md` distinguishes Session, Session token, App token, Session state, Profile and Viewer. The distinction is visible in `packages/core/src/session-store.ts`, `session-claims.ts` and adapter viewer APIs.
- `tooling/repo-checks/src/glossary.ts` derives forbidden words from the glossary and checks source/docs. Its unusedExceptions function rejects stale exceptions. This is substantially stronger than a prose terminology guide.
- Files such as access-codes.ts, roles.ts, mint-token.ts and provision.ts tell a newcomer what behavior they hold.

Weaknesses:
- `packages/create-robkit/templates/base/apps/hub/src/core-api.ts:18` calls the /session wire answer Session, while core calls it SessionAnswer and the glossary reserves Session for core's stored browser record.
- Glossary checks exempt some ambiguous words everywhere and do not scan templates (`tooling/repo-checks/src/glossary.ts`, exceptions and readScannedFiles), so a major product surface relies on review for terminology.

Worth copying into robkit:
- Retain the glossary-to-executable-check connection and its stale-exception check.

To raise this by one point:
- Rename the hub's Session wire type to SessionAnswer in `packages/create-robkit/templates/base/apps/hub/src/core-api.ts` and its consumers/tests.
- Include authored template source in readScannedFiles in `tooling/repo-checks/src/glossary.ts`; add narrow contextual exceptions and a fixture proving template terminology violations fail.

## 5. Simplicity: 8/10

What they do well:
- Nine published packages need only seven distinct external runtime libraries. There is no generic dependency-injection framework or command bus between a route and its domain operation.
- `packages/core/src/routes/access-codes.ts` reads the request, calls a domain function and translates the result. `packages/guard/src/guard.ts:111` makes the decision table explicit and exhaustively typed.
- Source files are mostly short; even the largest runtime file is 381 lines. Thin adapters are a good use of wrappers because they adapt different framework contracts.

Weaknesses:
- `packages/create-robkit/src/coolify-deploy.ts:29` describes application settings as Record<string, string | boolean>. Later string conversion/property lookup compensates for a structure whose fields are already known in desiredApp. This adds avoidable reasoning about missing/wrong field values.
- Browser boundary logic has a second isRecord, reader convention and error wrapper in `templates/base/packages/core-client/src/call-core.ts`, alongside the input package the install already uses. Behavioral-equivalence tests mitigate drift but do not remove the maintenance duplication.

Worth copying into robkit:
- Preserve direct route-to-domain functions and small adapter modules as the default shape for new behavior.

To raise this by one point:
- Replace Desired.settings in `packages/create-robkit/src/coolify-deploy.ts` with an explicit settings interface; remove unnecessary String conversions and add missing-field type checks in its tests.
- Reuse the input package's object reader in `packages/create-robkit/templates/base/packages/core-client/src/call-core.ts` and retain one browser-specific transport result wrapper, rather than duplicating input primitives.

## 6. Consistency: 8/10

What they do well:
- Shared lint/TypeScript configuration and colocated tests are consistent across packages. CLI entry points converge on `packages/dev/src/run-command.ts:25`.
- Readers return InputProblem; callers generally use isProblem, with a dedicated source/doc check in `tooling/repo-checks/src/problem-checks.ts` to catch an alternative typeof-based convention.
- Core routes share request-body and viewer handling through `packages/core/src/routes/context.ts`.

Weaknesses:
- Workspace input readers use T | InputProblem, whereas template core-client's Reader returns T | undefined and CallOptions wraps failures with ok/error. Transport results can reasonably differ, but malformed-data readers consequently lose the consistent diagnostic convention (`templates/base/packages/core-client/src/call-core.ts:5`).
- `packages/create-robkit/templates/base/eslint.config.js` duplicates selected workspace policies as AST selectors. It lacks the workspace's no-silent-catch, brand-cast and suppression-description enforcement, so generated code has a materially different standard.

Worth copying into robkit:
- Keep one command boundary and one core route context instead of letting each command/route evolve its own setup.

To raise this by one point:
- Align template Reader with InputProblem in `packages/create-robkit/templates/base/packages/core-client/src/call-core.ts`, and adapt hub/admin response readers and tests to preserve a useful parse failure.
- Generate template lint policy from a shared declarative policy source, or ship a small reusable config, changing `tooling/eslint/index.js`, `packages/create-robkit/templates/base/eslint.config.js` and generator tests together. Keep install-owned layer checking in robkit check.

## 7. Error handling: 8/10

What they do well:
- `packages/dev/src/run-command.ts:25` prints fixable CommandProblem messages without a stack and reports unexpected faults with a reporting URL and original error.
- `packages/core/src/app.ts:81` logs unexpected route errors with request IDs and returns an ID that lets the operator find the cause.
- `packages/session/src/request-guard.ts` distinguishes core unavailability from signed-out state, returning 503 and reporting typed fault details rather than redirecting a valid viewer to login.
- Coolify and browser core requests have deadlines; the browser call deadline covers headers and body (`templates/base/packages/core-client/src/call-core.ts:49`).

Weaknesses:
- callCore reports network/JSON causes only through an optional report callback. Hub and admin wrappers inspected here do not supply one. A malformed 2xx response consequently becomes a generic unreadable-answer message without default operator diagnostics.
- `packages/react/src/session-fetch.ts:27` forwards to fetch without a default deadline. An unresponsive request can stay pending even before the intentional navigation-related pending promise is reached. The general outbound-timeout convention does not hold for this helper.

Worth copying into robkit:
- Preserve both the core request-ID boundary and the guard's unavailable-versus-signed-out distinction.

To raise this by one point:
- Give callCore a default diagnostic reporter in `packages/create-robkit/templates/base/packages/core-client/src/call-core.ts`; report failed successful-response decoding with method/path/status, without logging credentials or response bodies. Test the default path.
- Add a bounded default request deadline to `packages/react/src/session-fetch.ts`, composed with caller cancellation, and test stalled requests/cancellation in `session-fetch.test.ts`. Preserve the intentional post-navigation behavior.

## 8. Testing: 8/10

What they do well:
- The forced gate actually ran source checks, public adapter type tests, packaging validation and generated-install unit tests. Guard and both server adapters measured 100% statement/branch coverage.
- `packages/hono/src/guarded.test-d.ts` tests forbidden calls as well as valid ones. Shared guard conformance cases prevent adapter behavior drifting.
- `tooling/e2e/src/owner-journey.ts` drives visible browser sign-in and expiration/refresh behavior. install-journeys covers guest access, roles and app-token isolation. Production has its own Docker/HTTPS journey.
- `tooling/repo-checks/src/changeset-config.test.ts` proves the actual changeset CLI fails on missing changesets, rather than asserting merely that a config key exists.

Weaknesses:
- `tooling/e2e/src/install-journeys.ts` claims the shared install in one test and subsequent owner/guest journeys reuse that state. Running a later test alone is harder and failures can cascade from setup behavior.
- Generator tests include exact source snapshots (`packages/create-robkit/src/generate.test.ts:31`) and source-text assertions. They are useful for output contracts, but some formatting/internal rearrangements change tests without behavior changing.
- Unit coverage does not catch the arbitrary-unknown reader failure reproduced above. create-robkit's 73.91% statement figure also includes child-process coverage blind spots, so it should not be interpreted as a precise measure of untested CLI behavior.

Worth copying into robkit:
- Keep negative type tests and real packed-artifact validation alongside behavioral tests.

To raise this by one point:
- Give each independently named journey its needed claimed-install fixture in `tooling/e2e/src/install-journeys.ts` and `tooling/e2e/src/install.ts`; ensure a selected journey can run alone without earlier it blocks.
- Add malformed-unknown reader cases in `packages/guard/src/guard.test.ts`, and replace noncontractual source snapshots/assertions in `packages/create-robkit/src/generate.test.ts` with generated-program build or behavior assertions where those already prove the requirement.

## 9. Keeping standards up: 9/10

What they do well:
- CI runs the full gate and separate PR rules, then aggregates them in one gate (`.github/workflows/ci.yml`). PR checks cover commit subjects, coverage reductions, changesets and existing ticket paths.
- Coverage thresholds are checked against both the base revision and observed coverage, with failure-fixture tests (`tooling/repo-checks/src/check-coverage-thresholds.test.ts`, `check-coverage-ratchet.test.ts`).
- API reports, packed JS targets, publint, Are the Types Wrong, compile-checked doc examples, dependency catalog checks, knip and the package graph cover substantially more than normal lint/typecheck.
- `.husky/pre-commit`, `.husky/commit-msg` and `.github/CODEOWNERS` provide local feedback and an explicit review owner. Branch protection itself was not inspected remotely; the workflow alone cannot prove enforcement in hosting settings.

Weaknesses:
- Written outbound-timeout policy is not mechanically enforced, and sessionFetch demonstrates an existing gap.
- Generated install lint policy and glossary scanning have narrower coverage than the workspace standards, as established in categories 4 and 6. Syntax checks such as no-bare-error are useful guardrails rather than proof that causes or diagnostics are meaningful.

Worth copying into robkit:
- Preserve tests that run the real enforcement command against deliberately invalid fixtures. They make the standards system credible.

To raise this by one point:
- Add a focused timeout policy check, with failing fixtures for an unbounded fetch and passing fixtures for caller-signal composition, under `tooling/repo-checks/src/`; wire it into the existing test gate and document explicit exceptions.
- Extend glossary coverage to templates and unify generated lint policy in the files identified in categories 4 and 6, with tests proving generated code rejects the same representative violations.

## 10. Nice to work in as a human: 8/10

What they do well:
- `CONTRIBUTING.md` supplies actual setup commands, Windows/WSL instructions, a linked install, fast/full gates, targeted tests and a first-change workflow. The observed forced gate took about a minute.
- Every published package has a README and API report. `docs/architecture.md`, `docs/conventions/input.md`, `docs/conventions/errors.md` and the lint/repo-check READMEs give useful entry points by concern.
- `tooling/repo-checks/src/doc-examples.ts:11` compiles doc examples against built packages, so guidance has executable support.
- `.scratch/kit/map.md` connects decisions to tickets and marks superseded decisions; ADRs give shorter settled explanations. This context is available without reading commit history.

Weaknesses:
- Hub/admin/core-client are template files rather than normal runnable workspace apps. A UI contributor must generate/install a second workspace to get normal framework feedback; install-checks itself documents hard-link installation restarting an existing dev stack (`packages/create-robkit/src/install-checks.test.ts:14`).
- The fast template check generates the default install and runs its tests/lint, but not its full typecheck (`install-checks.test.ts:62`). A contributor's fast loop therefore gives less complete feedback for template-only type mistakes than workspace source changes.
- Full local dev still depends on Docker and POSIX process groups. Windows support is clearly documented, but a validated preflight could shorten setup failures.

Worth copying into robkit:
- Keep compiled documentation and linked-install instructions as part of the supported contributor workflow.

To raise this by one point:
- Add generated-install typecheck beside lint/tests in `packages/create-robkit/src/install-checks.test.ts`, with a regression fixture showing a template type error fails the fast gate.
- Add a reusable template-development command in `package.json` and `packages/create-robkit/src/set-up.ts` that maintains a linked preview install without reinstalling on every check; document the loop and hard-link restart behavior in `CONTRIBUTING.md` and `packages/create-robkit/README.md`.
- Add preflight checks for the supported Node/pnpm/Docker/platform prerequisites before starting `packages/dev/src/runner.ts`, with actionable CommandProblem output and contributor troubleshooting instructions.

## Top 5 practices to copy

1. Declare dependency direction once and verify manifests, imports, runtime/development distinctions and cycles. Evidence: `tooling/eslint/package-graph.js`, `tooling/repo-checks/src/graph-check.ts`.
2. Put authorization in a pure decision function and share the request protocol beneath thin framework adapters. Evidence: `packages/guard/src/guard.ts`, `packages/session/src/request-guard.ts`, `packages/hono/src/guarded.ts`, `packages/start/src/guarded.ts`.
3. Reject untrusted strings at boundary constructors and prove unsafe calls fail compilation. Evidence: `packages/input/src/env.ts`, `packages/input/src/slug.ts`, `packages/hono/src/guarded.test-d.ts`.
4. Check the actual package artifact and the documentation consumers copy, not just source compilation. Evidence: `tooling/repo-checks/src/published.test.ts`, `tooling/repo-checks/src/api-report.test.ts`, `tooling/repo-checks/src/doc-examples.test.ts`.
5. Make standards checks test their own failure behavior, and ratchet the measured standard. Evidence: `tooling/repo-checks/src/changeset-config.test.ts`, `check-coverage-thresholds.test.ts`, `check-coverage-ratchet.test.ts`.

