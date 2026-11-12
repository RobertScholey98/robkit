# robkit quality report

Commit: 6b912f9e02c3ab13a10e04726f177ab4ae3d82f2. Independent reviewer: Sol. Scope: all eight published packages' manifests and entry surfaces; detailed reading of guard, session, adapters, core HTTP and access flows, dev lifecycle, create-robkit generation/add/check/deploy flows; shared ESLint, TypeScript, repository checks, CI and hooks; selected generated core-client/admin code and whole-stack journeys; root and package documentation. Skipped Docker-backed execution, exhaustive UI component inspection, and external services. Read only the rubric under `.scratch/quality-hillclimb/`, as required. No earlier reports or scores were consulted. This is a codebase assessment, not a claim that every function was audited.

## Scores

| # | Category | Score | One-line reason |
| --- | --- | --- | --- |
| 1 | Module boundaries | 8 | Small adapters and tested dependency rules, with a runtime/test import classification gap. |
| 2 | Public API design | 7 | Clear unions and small adapter APIs, but address helpers bypass the slug invariant and examples lag types. |
| 3 | Type safety at the edges | 8 | Strict configuration, branded slugs and real readers; some validation contracts remain weaker than their descriptions. |
| 4 | Naming and domain language | 8 | Coherent vocabulary in most features, with stale template-layer language and some generic exported names. |
| 5 | Simplicity | 7 | Direct functional code and few runtime dependencies, but obsolete merge machinery and concentrated orchestration remain. |
| 6 | Consistency | 7 | Shared tooling and boundary conventions work broadly; object readers and command failure classification diverge. |
| 7 | Error handling | 7 | Useful tagged failures, timeouts and diagnostic hooks; lifecycle faults and override errors have gaps. |
| 8 | Testing | 7 | Strong behavior, conformance and production journeys; the fast gate timed out and omits existing pure tests. |
| 9 | Keeping standards up | 8 | Extensive executable standards, API/pack checks and ratchets, with meaningful holes beyond formatting. |
| 10 | Nice to work in as a human | 7 | Good architecture and contributor navigation, undermined by broken examples and an unreliable advertised fast gate. |

## Measurements

- `git rev-parse HEAD`: the full commit above. `git status --short` was empty before review and after checks. No tracked files were edited. The report lives outside the checkout.
- `pnpm install --frozen-lockfile`: passed using the brief's Git Bash PATH shim; pnpm 11.28.9, 12.1 seconds. Reported 15 projects including the root.
- `pnpm check`: failed, exit 1. Prettier and knip passed. Turbo reported 41 successful tasks of 42, 13 cached, 2m24.484s. The failing task was create-robkit's unit suite: 159 passed, six failed across three files, all timeout-related. Cached logs included another worktree's paths, so those tasks are cache reuse, not fresh executions in this checkout.
- Fresh rerun: `pnpm --filter create-robkit exec vitest run src/bin.test.ts`: 11/11 passed, 4.77 seconds.
- Fresh rerun: `pnpm --filter create-robkit exec vitest run src/add.test.ts src/check.test.ts --maxWorkers=1`: 32/32 passed, 8.45 seconds. This supports resource contention as an explanation, not proof that the full gate is healthy.
- Observed gate suites included session 224 tests, Start 29, Hono 28, React nine, repository checks 66; cached guard logs reported 50 and ESLint 54. Session, adapters and React reported no type-test errors.
- A tracked-file inventory via `git ls-files packages tooling` found 14 package manifests: eight published and six internal packages. It found 89 `*.test.ts`, `*.test-d.ts`, `*.test.tsx` or JS equivalents, including templates.
- Source measurement scope: tracked `packages/**/src` and `tooling/**/src` scripts, excluding templates, `/test/` fixtures and `*.test*`. There are 93 script files, 92 TypeScript files. A TypeScript AST walk found zero explicit `any` types, 26 non-const assertions and 18 const assertions. Of the 26, 25 are in internal tooling; the one in published source is widening `JSON.parse` to `unknown` at `packages/create-robkit/src/coolify.ts:210`. There are zero `@ts-ignore`, `@ts-expect-error` or `eslint-disable` strings in this measured non-test source. Word searches for `any` or `as` include prose/import aliases and were not treated as type counts.
- Largest measured files: `packages/create-robkit/src/coolify.ts` 575 lines; `tooling/e2e/src/production-stack.ts` 529; `tooling/e2e/src/install-journeys.ts` 494; `packages/core/src/app.ts` 466; `packages/session/src/request-guard.ts` 416. Counts use newline separators.
- Unique external names in package `dependencies`: 11 including internal lint tooling, seven across published packages: `@clack/prompts`, `prettier`, `yaml`, `postgres`, `drizzle-orm`, `hono`, `jose`. Peer and dev dependencies are excluded from this count.
- Direct read-only probes confirmed: `importProblems` accepts a hypothetical `packages/core/src/hypothetical.ts` importing core's dev-only `@internal/test-postgres`; `install({domain:'example.com'}).origin('bad/path')` returns `http://bad`; session's `isRecord([])` is false while generated core-client's is true; invalid JSON through `jsonObject` and `runCommand` prints a fixable syntax message followed by "That's a bug in robkit".
- Docker-backed suites were not run. End-to-end and production evidence below is source inspection, not an observed successful journey. No external spec was fetched.

## 1. Module boundaries: 8/10

What they do well:
- `packages/guard/src/guard.ts` contains a pure policy table. `packages/hono/src/guarded.ts` and `packages/start/src/guarded.ts` delegate request/session work to one shared operation and only adapt the allowed viewer to their framework.
- `tooling/eslint/layers.js:44` declares forbidden framework, I/O and core imports. Its visitors inspect imports, re-exports, dynamic imports and forbidden global references. `tooling/eslint/layers.test.js` exercises violations rather than trusting configuration text.
- `tooling/repo-checks/src/package-graph.ts` records allowed workspace edges. `graph-check.ts` checks manifests, cross-folder imports, cycles and contradictions with ESLint. The 15 graph tests passed in the gate.
- Generated installs get a separate AST-based checker, `packages/create-robkit/src/check.ts`, covering both apps and shared packages. The affected checker tests passed on rerun.

Weaknesses:
- `tooling/repo-checks/src/graph-check.ts:143` builds the same allowed import set from runtime and dev edges for every source file. The direct probe accepted a production import of `@internal/test-postgres` from core. Manifest classification is stricter than source classification.
- `packages/dev/src/index.ts` exposes command handling, proxy, discovery and production provisioning from one entry. `packages/session/src/index.ts` combines token primitives with request orchestration. These are understandable surfaces, but not packages whose entry alone explains all relevant behavior.

Worth copying into robkit:
- Preserve the table-driven rules and negative tests whenever adding a workspace or install layer.

To raise this by one point:
- In `tooling/repo-checks/src/graph-check.ts`, classify runtime source separately from test/config files and allow only runtime edges for it; add a negative case in `graph-check.test.ts` using core's test-postgres dependency.
- Split dev's proxy/discovery helpers from production provisioning through explicit subpath exports in `packages/dev/package.json`, with corresponding README and API-report updates.

## 2. Public API design: 7/10

What they do well:
- `packages/guard/src/guard.ts:1` models access, viewer, session state and decision as small discriminated unions. `Decision` only carries a viewer on allow; adapters consume a two-way `RequestDecision`.
- `packages/start/src/guarded.ts` documents context registration and wraps the server entry so guard code stays on the server. `packages/hono/src/guarded.ts` provides typed `c.var.viewer` with little ceremony.
- `packages/create-robkit/src/init.ts` provides one operation for generating, writing, initializing git and installing dependencies, shared with integration code.
- API reports are generated from built declarations and checked in `tooling/repo-checks/src/api-report.test.ts`; packed exports also pass publint and Are the Types Wrong in the observed gate.

Weaknesses:
- `packages/session/src/install-addresses.ts:77` accepts arbitrary strings for `host` and `origin`, despite providing a `Slug` brand. The probe producing `http://bad` from `bad/path` demonstrates an observable contract gap, not just a type preference.
- `packages/session/README.md:15` passes literal `"notes"` where `GuardedOptions.app` requires `Slug`. `request-guard.test-d.ts:28` explicitly tests rejection of plain strings. `packages/dev/README.md:32` similarly constructs `string[]` for a `readonly Slug[]` API.
- AccessRule's roles are mutable `string[]`; nonempty role selection is enforced by core's HTTP reader rather than the shared type. This may be intentional for persisted empty rules, but callers must learn the distinction from implementation.

Worth copying into robkit:
- Keep type-level misuse tests alongside the declaration reports; they check different aspects of compatibility.

To raise this by one point:
- Change address helper parameters to `Slug` in `packages/session/src/install-addresses.ts`, update callers to use `readSlug`, and add compile-time rejection of an arbitrary string plus a runtime malformed-input case.
- Fix and compile the session/dev README examples in a documentation-example check under `tooling/repo-checks/src/`, rather than maintaining unverified snippets.

## 3. Type safety at the edges: 8/10

What they do well:
- `tooling/typescript/base.json` enables strict mode, unchecked indexed access, exact optional properties, override checks and erasable syntax. `tooling/eslint/index.js:28` adds strict type-aware lint and forbids narrowing assertions outside tests.
- The AST measurement found zero explicit any types and no narrowing assertions in the inspected published production source. Internal assertion exceptions are explicit, for example `tooling/repo-checks/eslint.config.js`.
- `packages/session/src/input.ts` turns JSON into unknown and reads individual fields. `readDatabaseUrl` deliberately omits the password-bearing value from diagnostics. `install-addresses.ts:21` brands slugs used in tokens and database provisioning.
- `packages/session/src/session-token.ts:65` reads signed claims field by field and distinguishes bad tokens from unavailable verification keys.

Weaknesses:
- Address construction still accepts strings, as demonstrated above.
- `packages/session/src/input.ts` checks manifest icons only for nonempty text and a length limit while saying they must be one emoji. `readHost` accepts a permissive character class rather than validating the address it describes. These readers produce types without fully guaranteeing the stated semantic contract.
- `tooling/repo-checks/src/graph-check.ts:38`, `catalog.ts:58` and `tooling/test-postgres/src/watcher.ts:9` assert file data into expected shapes. These are internal tools, so the risk is less than a public HTTP boundary, but the full repository is not assertion-free.

Worth copying into robkit:
- Use a brand for values interpolated into SQL or addresses and preserve unknown until a reader checks the relevant fields.

To raise this by one point:
- Align icon validation and its error text in `packages/session/src/input.ts`: either accept a documented short label or validate one emoji grapheme; add adversarial cases to `input.test.ts`.
- Replace asserted manifest/watcher shapes with small readers in `tooling/repo-checks/src/graph-check.ts`, `catalog.ts` and `tooling/test-postgres/src/watcher.ts`, especially for fields later iterated or used to clean up resources.

## 4. Naming and domain language: 8/10

What they do well:
- `packages/core/src/owner.ts`, `access-codes.ts`, `roles.ts`, `sessions.ts` and `apps.ts` map cleanly to distinct concepts. The same terms appear in route handlers and observable tests.
- `packages/session/src/input.ts` separates `DeclaredAccess.roleNames` from runtime `AccessRule.roles` holding IDs. That distinction prevents a real naming ambiguity rather than merely standardizing vocabulary.
- `GLOSSARY.md` and `docs/architecture.md` describe relationships using names visible in code. The adapter names and entry functions are consistent between Hono and Start.

Weaknesses:
- `GLOSSARY.md:122` says templates are no longer layered, but `packages/create-robkit/src/generate.ts:59` still has `readLayer`, and lines 97-108 explain layered manifest merging. `generate.test.ts` still names a layer-merging behavior. This actively contradicts the settled meaning of layer.
- Public `Declares` and local `Asking`/`member` (`packages/guard/src/guard.ts:46`) require more explanation than `AppDeclaration` and a guest-with-required-role name. This is a small issue; the guard's member state is not a separate persisted kind of person.

Worth copying into robkit:
- Keep names-versus-IDs explicit in access-rule types and serializers.

To raise this by one point:
- Rename `readLayer` and remove obsolete layer/merge descriptions in `packages/create-robkit/src/generate.ts` and `generate.test.ts` after simplifying the engine.
- Rename exported `Declares` to `AppDeclaration` in `packages/session/src/input.ts` and callers, with its API-report update, to make the public type understandable without its surrounding comment.

## 5. Simplicity: 7/10

What they do well:
- The guard answers policy through one table. Adapters contain tens of lines, not competing implementations of authentication.
- `packages/create-robkit/src/init.ts` states the operation in three ordered steps. `appFiles` is shared by generation and add, reducing divergent output.
- Published packages use only seven unique external runtime dependency names. The code generally uses functions and web-standard requests rather than service containers or elaborate class hierarchies.
- Knip ran successfully in the gate, providing an actual check for unused exports/dependencies.

Weaknesses:
- `packages/create-robkit/src/generate.ts:67` retains deep merge, manifest sorting and collision behavior for an overlay that now has one caller mounting a stack under `apps/example/`. The current structure does not need a general layered merge engine. Knip cannot detect obsolete branches inside used functions.
- `packages/create-robkit/src/coolify.ts` combines config parsing, HTTP interpretation, resource lookup, environment updates and deployment polling in 575 lines. It is reasonably readable but a substantial unit to hold in mind.
- `packages/core/src/apps.ts:177` answers one app's rule by loading all apps and all rule associations through `listApps`, rather than querying the requested slug. This trades local reuse for hidden work on every cache miss.

Worth copying into robkit:
- Retain one operation for init and one rendering path for apps as new stacks arrive.

To raise this by one point:
- Replace the single overlay with a direct prefixed mount in `packages/create-robkit/src/generate.ts`; remove deepMerge/mergeManifests and revise the obsolete merging test.
- Implement a slug-filtered query in `packages/core/src/apps.ts:accessOf` and retain behavior tests for unknown apps, owner/open rules and role rules.

## 6. Consistency: 7/10

What they do well:
- Shared ESLint/TypeScript configurations and `.ts` relative imports are mechanically checked. The non-test measurement found no lint suppression comments.
- Most command input failures flow through `InputProblem` and `Problem` to `runCommand`; most server failures become explicit outcomes or the central core boundary.
- Generated admin calls core through `callCore` with typed readers and result objects, as shown in `templates/base/apps/admin/src/client/access-api.ts`.

Weaknesses:
- `packages/session/src/input.ts:isRecord` excludes arrays; generated `packages/core-client/src/call-core.ts:isRecord` accepts them. A direct probe verified the different answers. Both names imply the same predicate.
- `packages/create-robkit/src/json.ts:10` throws Error for malformed JSON, while `add.ts:47` throws Problem for malformed robkit.json. An owner-editable template reaches the former helper through appFiles, so the same class of repairable mistake receives a different command-boundary treatment.
- Shared input handling and adapter contracts are stricter than package README examples. This is drift across source and contributor guidance, not a cosmetic formatting concern.

Worth copying into robkit:
- Reuse the result-and-reader convention for platform client calls rather than introducing a third response model.

To raise this by one point:
- Give the generated core-client record predicate the same array exclusion as session's and add parity cases to its `call-core.test.ts`.
- Make malformed owner-controlled template manifests a Problem at `packages/create-robkit/src/add.ts`, retaining fault classification for corrupted shipped templates; test both paths.

## 7. Error handling: 7/10

What they do well:
- `packages/dev/src/cli.ts:25` keeps actionable Problems separate from faults, preserving full fault objects and pointing to reporting instructions.
- `packages/core/src/app.ts:140` centralizes unexpected HTTP failures with logging and a generic response; the health route logs unreachable database failures. `packages/core/src/app.test.ts` tests that boundary.
- `packages/session/src/request-guard.ts:231` reports a structured fault hook and answers 503 when verification cannot run rather than treating a viewer as signed out. Token readers preserve this distinction.
- `packages/create-robkit/src/coolify.ts:173` combines per-request and overall deadlines and provides targeted configuration/log advice. Shared core-client also has an outbound timeout.
- `tooling/eslint/no-silent-catch.js` and preserve-caught-error make discarded errors explainable and catch rewrites preserve causes.

Weaknesses:
- `packages/dev/src/runner.ts` installs only an exit listener on spawned apps. A spawn error has no child error listener in that path and can escape the intended lifecycle cleanup. Also, rejection from `Promise.all(running.map(stopGroup))` bypasses proxy/Docker cleanup and listener removal. These are source-inspected failure paths, not Docker reproductions.
- Malformed override JSON is classified as a robkit bug. A direct `jsonObject`/`runCommand` probe printed the parser repair message followed by the bug-report instruction.
- Comment-based exceptions in no-silent-catch do not prove that ignoring an error is correct. `runner.ts:16` treats every signal-zero failure as proof that a group is gone, although permission errors are another possible outcome.

Worth copying into robkit:
- Keep unavailable verification distinct from invalid credentials and give boundary logging a replaceable callback.

To raise this by one point:
- In `packages/dev/src/runner.ts`, handle child error events through the same failure/stop path, and put cleanup under a finally-style sequence that attempts every resource cleanup even after one rejects; add spawn/cleanup failure cases in `runner.test.ts`.
- Preserve error codes when checking/stopping groups and swallow only ESRCH in `runner.ts`, with tests for other failures.
- Classify malformed editable overrides as Problem in `packages/create-robkit/src/add.ts` and add a CLI regression case.

## 8. Testing: 7/10

What they do well:
- Guard conformance cases are shared with adapters; `packages/guard/conformance.json` includes wrong-audience and missing-audience cases. Each adapter also has compile-time misuse tests.
- Tests exercise HTTP boundaries and observable command output, including actual prompt-driving and reproducibility of the printed noninteractive command in `packages/create-robkit/src/bin.test.ts:39`.
- `tooling/e2e/src/install-journeys.ts` covers generated installs, app addition, owner/guest access, refresh, roles, accessibility, theme changes and shutdown. `own-ci.ts` runs generated workflow commands; the whole-stack journey also tests layer-rule/hook enforcement.
- Production sources exercise HTTPS/proxy behavior and installed dependency closure. Cleanup watchers are explicitly registered before test processes launch. This is valuable breadth, though not executed here.
- Coverage thresholds and actual observed adapter coverage are strong: Hono/Start 100% in the gate, session 96.32% statements and 93.47% branches.

Weaknesses:
- The prescribed full fast gate failed six timeout cases. All affected files passed targeted reruns, so I do not infer six product defects, but test reliability under its advertised command is still below exemplary.
- `packages/dev/vitest.config.ts` and `packages/core/vitest.config.ts` put global Docker setup over whole packages. Existing pure tests such as `dev/src/env.test.ts`, `dev/src/cli.test.ts` and `core/src/access-codes.test.ts` are omitted by `pnpm check` because those packages have no test:unit script.
- Coverage is uneven: dev thresholds permit 60% statements/52% branches; create-robkit permits 64%/51%. These are thresholds, not claims about this run's measured coverage. The latter suite failed before a successful coverage report.
- Several create-robkit assertions generate and write an entire install independently. The gate logged generate.test.ts at 93 seconds and add.test.ts at 97 seconds, whereas isolated reruns were much shorter.

Worth copying into robkit:
- Test the generated install as a consumer, including its own CI and git hook, rather than relying solely on template text snapshots.

To raise this by one point:
- Add non-Docker Vitest configurations/test:unit scripts for pure dev/core suites, moving global setup to integration-only configurations in their package manifests and Vitest configs.
- Reduce repeated full-install generation with immutable in-memory fixtures where the assertion is about text; bound create-robkit worker concurrency in `vitest.config.ts` based on a repeatable Windows gate run. Keep independent disk tests for write/add behavior rather than merely raising timeouts.

## 9. Keeping standards up: 8/10

What they do well:
- `.github/workflows/ci.yml` installs frozen dependencies and runs check:all, with a gate aggregating check and pull-request jobs. PR-specific jobs check commit subjects, coverage threshold regression and changeset status.
- `tooling/repo-checks/src/check-coverage-thresholds.test.ts` exercises real temporary git repositories and changes, including config deletion. The four cases passed, showing the ratchet is executable rather than documentation.
- Built declaration reports and packed-package checks passed in this gate. Catalog checks verify manifest versions and unused catalog entries, including templates. Knip also ran successfully.
- `.husky/pre-commit`, `.husky/commit-msg`, `.github/CODEOWNERS`, the PR template and AGENTS guidance reinforce the workflow. Custom lint rules have negative tests, including meaningful suppression descriptions and unused-disable rejection.
- Nightly and production workflows explicitly execute production behavior beyond the ordinary PR gate. I did not inspect remote branch protection, so required-check configuration is not independently verified.

Weaknesses:
- The graph source checker accepts test-only imports in runtime source, despite the documented distinction between production and development edges.
- README examples are outside compile checks and are already incorrect. A standard that examples follow the current public API is not enforced.
- `no-silent-catch` accepts any qualifying comment, not a semantic justification. Address/emoji invariants also have gaps despite strong type/lint settings. Mechanical standards are extensive but do not make every written rule unbreakable.

Worth copying into robkit:
- Continue pairing each new project rule with a failing fixture and keep generated API surfaces reviewable.

To raise this by one point:
- Add runtime-versus-test import classification in `tooling/repo-checks/src/graph-check.ts` and the corresponding negative tests.
- Add compiled public API examples to `tooling/repo-checks` and make `pnpm check` run them, including all package README examples that create branded values.

## 10. Nice to work in as a human: 7/10

What they do well:
- `CONTRIBUTING.md` explains Windows/WSL, prerequisites, commands, tickets, commit rules, a worked change and failure investigation. `docs/architecture.md` maps request/token flows to actual source files.
- Each published package has a README and API report. Most source functions have brief purpose comments; many explain why, for example localhost resolution in `session/src/loopback-fetch.ts` and server-entry wrapping in `start/src/guarded.ts`.
- `pnpm create-install` provides a linked consumer environment; init prints reproducible flags. The CLI tests verify this observable contract.
- Whole-stack failures capture browser and process evidence. Input problems often name the exact setting and the repair, reducing trial and error.

Weaknesses:
- Session/dev examples cannot typecheck under current Slug signatures. `packages/dev/README.md:58` also lists `provisionApps(options)` although the implementation takes root and options. `CONTRIBUTING.md`'s guard-change walkthrough tells contributors to pick session for a changeset after changing guard.
- CONTRIBUTING advertises the fast gate as under a minute; this run took over two minutes and failed six timeout cases. Reruns were useful and documented, but make the first contributor experience less predictable. Hardware/load vary, so this is an observed limit, not a universal timing claim.
- The complete dev loop requires Docker and POSIX process groups; the Windows fast gate helps, but core/dev pure tests are not readily available through it.

Worth copying into robkit:
- Preserve the architecture-to-file map and linked-install command; both connect a local edit to the consumer's experience.

To raise this by one point:
- Repair the session/dev README examples and provisioning signature table, and change the worked guard example's changeset package in `CONTRIBUTING.md` to `@robkit/guard`; compile examples as part of the gate.
- Update gate timing guidance from measured environments in `CONTRIBUTING.md` and provide explicit non-Docker core/dev test commands once the suites are split.

## Top 5 practices to copy

1. Keep authentication policy pure and share conformance fixtures across framework adapters. Evidence: `packages/guard/src/guard.ts`, `packages/guard/conformance.json`, Hono/Start guarded tests.
2. Represent input as unknown until a reader constructs domain values, and brand values used in SQL/token destinations. Evidence: `packages/session/src/input.ts`, `packages/session/src/install-addresses.ts`, `packages/dev/src/provision.ts`.
3. Treat generated installs as products to test, including their CI, hooks, accessibility and production dependency closure. Evidence: `tooling/e2e/src/install-journeys.ts`, `own-ci.ts`, `production-stack.ts`, `extraneous-packages.js`.
4. Review built public declarations and validate packed artifacts, not just source imports. Evidence: `tooling/repo-checks/src/api-report.test.ts`, `published.test.ts`.
5. Test standards enforcement with negative cases and real base-versus-head comparisons. Evidence: `tooling/eslint/layers.test.js`, `suppressions.test.js`, `tooling/repo-checks/src/check-coverage-thresholds.test.ts`.
