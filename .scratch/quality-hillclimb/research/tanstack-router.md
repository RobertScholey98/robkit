# TanStack Router / Start quality report

Commit: c5320d7ca23eca82d720ac5629d2bad5cf7d9b02. Commit date: 2026-11-04. Scope: static, read-only research on the supplied shallow clone of TanStack/router.

Read: root package scripts, TypeScript, ESLint, Nx and workspace configuration; root and package contributor instructions; CONTRIBUTING.md, DEBUGGING.md and README.md; PR, release, autofix and skills workflows; CODEOWNERS, PR template and CodeRabbit configuration. Inspected manifests and source inventories for router-core, react-router, start-client-core, start-server-core, start-plugin-core, router-generator, router-plugin, router-cli, and the React/Solid/Vue start, start-client and start-server adapters. Read representative entry points, navigation, redirect/not-found APIs, server-function creation/validation, HTTP payload handling, response/error handling, context merging, generator configuration, CLI generate/watch, framework Vite plugins and compiler/import-protection architecture documentation. Read representative runtime, inference and generator tests, plus React Start browser regression tests and their runner configuration. Inspected custom ESLint rule registration and the route-property-order rule for category 9. Read getting-started pages and the basic Start example README for onboarding.

Skipped: exhaustive reading of large runtime/compiler files and generated fixtures; most individual tests, examples, e2e applications and docs; detailed Solid/Vue Router internals; devtools, query integrations, validation adapters, experimental RSC implementation, benchmark implementation and unrelated packages. Examples/e2e implementation code is not scored. No create/scaffold package exists among the 41 direct packages; the included router-cli generates/watches route trees. The documented application scaffolder is the separate @tanstack/cli project, so its implementation is outside this score (docs/router/quick-start.md:12,28; docs/start/framework/react/getting-started.md:20).

No installs, builds, tests or network requests were run. Configured gates are evidence of intended enforcement, not evidence that this checkout passes them. Hosted branch protection, actual CI outcomes and test speed cannot be established from this clone. This report is AI-assisted research, not a contribution to the assessed repository.

## Scores

| # | Category | Score | One-line reason |
|---|---|---|---|
| 1 | Module boundaries | 7/10 | Shared cores and thin adapters have real build/export boundaries, but broad barrels expose implementation details. |
| 2 | Public API design | 7/10 | Strong inference and useful API comments coexist with a very large surface and inference-sensitive property ordering. |
| 3 | Type safety at the edges | 6/10 | Strict compilation and schema validation are strong; internal erasure and loosely typed transport decoding remain substantial. |
| 4 | Naming and domain language | 8/10 | Route, loader, match, middleware and hydration vocabulary maps well to files, with some legacy naming and metadata drift. |
| 5 | Simplicity | 6/10 | Thin adapters and modest runtime dependencies help, but core and compiler changes require substantial context. |
| 6 | Consistency | 8/10 | Framework packages, configuration parsing and build targets repeat recognizable patterns, with some exceptions. |
| 7 | Error handling | 7/10 | Explicit HTTP/error reconciliation and actionable config diagnostics are good; generic exceptions and swallowed cleanup remain. |
| 8 | Testing | 8/10 | Runtime, inference, generator, integration and browser coverage are broad; some tests couple to internals and some targets are placeholders. |
| 9 | Keeping standards up | 8/10 | CI, compiler matrices, package checks, custom lint and release automation enforce much, but several written rules remain advisory. |
| 10 | Nice to work in as a human | 8/10 | Detailed contribution guidance, local architecture notes and examples help; large builds and separate docs hosting add setup cost. |

## Measurements

Counts describe the checked-out snapshot, not test outcomes or defect counts.

| Measurement | Result | Method / evidence |
|---|---|---|
| Tracked files | 12,520 | `git ls-files`, split nonempty output lines. |
| Direct library packages | 41 | Direct `packages/*/package.json` files; excludes example/e2e workspace packages. |
| Scored inventory | 17 packages | Eight principal packages plus three Start packages for each of React, Solid and Vue, listed below. |
| Non-test source `any` tokens | 768 | Lexical `\bany\b` across the selected source files. Includes comments/strings, generic erasure and deliberate existential types. |
| Non-test source `as` tokens | 861 | Lexical `\bas\b`; includes import aliases, comments and `as const`, so this is not an AST cast count. |
| Non-test source `as any` | 135 | Lexical `\bas\s+any\b` over the same files. |
| Suppressions | 3 `@ts-ignore`, 1 `@ts-expect-error`, 84 `eslint-disable` occurrences | Same lexical inventory. Three ignores are the build/declaration workaround at packages/start-server-core/src/createStartHandler.ts:130,132,134. Counts include generated-code header strings. |
| Main barrel size | router-core 492 lines; react-router 346 lines | packages/router-core/src/index.ts; packages/react-router/src/index.tsx. Line-count convention below. |
| Test file inventory | 346 files in the eight principal packages, including 32 `test-d` files | Filename matching below; does not count individual test cases or establish execution/coverage. |
| E2E inventory | 317 `.spec.` files | Recursive e2e file inventory. Not all configurations necessarily run every spec. |
| Documentation inventory | 248 Markdown files | Recursive docs/**/*.md inventory. |
| Compiler matrix | TS 5.6, 5.7, 5.8, 5.9, 6.0, 7.0 | packages/router-core/package.json scripts; also start-server-core and router-generator manifests. |

| Package | Selected source files | Source lines | Direct dependencies | Export-map keys |
|---|---:|---:|---:|---:|
| router-core | 75 | 19,194 | 4 | 6 |
| react-router | 54 | 6,246 | 4 | 4 |
| start-client-core | 38 | 4,805 | 4 | 7 |
| start-server-core | 23 | 5,426 | 7 | 7 |
| start-plugin-core | 90 | 21,693 | 21 | 6 |
| router-generator | 16 | 5,490 | 8 | 2 |
| router-plugin | 27 | 3,852 | 9 | 7 |
| router-cli | 3 | 131 | 3 | 2 |
| react-start | 23 | 405 | 9 | 18 |
| react-start-client | 11 | 960 | 3 | 4 |
| react-start-server | 4 | 50 | 3 | 2 |
| solid-start | 16 | 287 | 7 | 13 |
| solid-start-client | 11 | 603 | 3 | 4 |
| solid-start-server | 4 | 49 | 3 | 2 |
| vue-start | 15 | 197 | 7 | 12 |
| vue-start-client | 3 | 133 | 3 | 2 |
| vue-start-server | 4 | 57 | 3 | 2 |

Dependency counts are manifest `dependencies` entries, including internal workspace dependencies, excluding dev/peer dependencies and transitive packages. Export-map counts include package.json and conditional subpaths; they are not counts of public symbols.

| Largest selected source files | Lines |
|---|---:|
| packages/router-core/src/router.ts | 3,055 |
| packages/router-core/src/load-client.ts | 2,571 |
| packages/start-plugin-core/src/vite/import-protection-plugin/plugin.ts | 2,381 |
| packages/router-core/src/route.ts | 2,140 |
| packages/start-plugin-core/src/start-compiler/compiler.ts | 2,022 |
| packages/start-plugin-core/src/rsbuild/import-protection.ts | 1,727 |
| packages/router-plugin/src/core/code-splitter/compilers.ts | 1,726 |
| packages/router-generator/src/generator.ts | 1,664 |
| packages/start-server-core/src/internal-request-response.ts | 1,491 |
| packages/router-generator/src/utils.ts | 1,325 |
| packages/start-server-core/src/createStartHandler.ts | 1,242 |
| packages/router-core/src/new-process-route-tree.ts | 1,235 |

| Principal package | Test/spec files | Of those, type-test files |
|---|---:|---:|
| router-core | 140 | 8 |
| react-router | 98 | 19 |
| start-client-core | 9 | 2 |
| start-server-core | 15 | 2 |
| start-plugin-core | 52 | 0 |
| router-generator | 10 | 1 |
| router-plugin | 22 | 0 |
| router-cli | 0 | 0 |

Commands and counting method:

- Ran `git rev-parse HEAD`, `git log -1 --format='%H %cs %s'`, `git ls-files` and `git status --porcelain`. Status was empty after inspection, before writing this report outside the clone.
- Used `rg --files` to inventory source, tests, scripts and configs; `rg -n` for validators, exceptions, suppressions, import rules and test assertions; PowerShell `Get-Content` and Node numbered slices for file reading. Searches for `no-restricted|boundar|enforce-module` in package ESLint configs found a targeted RSC boundary config, not a general core/framework dependency rule. The imported external TanStack ESLint preset was not resolved or audited.
- Ran a Node script through PowerShell `@' ... '@ | node`; recursive `fs.readdirSync(...,{withFileTypes:true})` selected `packages/<name>/src` files matching `/\.[jt]sx?$/`, excluding paths matching `/(test|spec|__tests__)/`. Applied the lexical expressions from the table to their concatenated UTF-8 text. Lines use `text.split('\n').length`, including a trailing empty segment when present. Largest files are sorted by that count.
- Test file selection recursively matches `/\.(test|spec)(-d)?\.[cm]?[jt]sx?$/` within the eight principal packages. `test-d.` distinguishes type-test files. Docs counts use `.endsWith('.md')`; e2e counts use `/\.spec\./`.
- A Python counting attempt could not run because Python was unavailable; the reported measurements are from the successful Node run. A few guessed file/config names did not exist; subsequent file inventories located actual configs in vite.config.ts and actual ESLint rules.

## 1. Module boundaries - 7/10

What they do well:
- Runtime routing is separated from React. router-core depends on history, cookies and serialization, while react-router depends on router-core and the React store (packages/router-core/package.json, dependencies; packages/react-router/package.json, dependencies). Start adapters delegate to shared runtime/build packages rather than copy the whole framework (packages/react-start-server/src/defaultStreamHandler.tsx:1; packages/solid-start/src/plugin/vite.ts:1).
- Package export maps constrain supported entry paths and separate SSR/client/server concerns. Nx builds dependencies before consumers, so packages are checked against built dependency outputs (packages/router-core/package.json, exports; nx.json, targetDefaults.build.dependsOn).
- Start import protection gives client/server separation an executable implementation, including all three framework server specifiers and `.server.*`/`.client.*` rules (packages/start-plugin-core/src/import-protection/defaults.ts:17).

Weaknesses:
- Entry files are catalogs rather than small explanations: 492 and 346 lines for the core and React barrels. Core exports underscore-prefixed load-client helpers and many lower-level manifest/path utilities (packages/router-core/src/index.ts:94,106,131). Framework Start roots also wildcard-export their client core (packages/react-start/src/index.ts:2).
- The inspected root/package configs do not establish a general prohibition on core importing a framework. Nx build ordering and export maps help but do not independently express that architectural rule (eslint.config.js:8; nx.json, targetDefaults). The external lint preset remains an inspection limit.

Worth copying into robkit:
- Keep adapters thin and validate package exports against built artifacts; add an explicit dependency-direction lint rule alongside those boundaries.
- Make server/client import restrictions a build-time feature with named file conventions, rather than relying solely on contributor memory.

## 2. Public API design - 7/10

What they do well:
- Inference carries valid route destinations through navigation. The type test builds a route tree and checks the exact permitted destination union (packages/react-router/tests/useNavigate.test-d.tsx:21,38). This is useful caller protection, not just internal type ornamentation.
- Hook documentation explains when to prefer Link and how `from` affects relative navigation (packages/react-router/src/useNavigate.tsx:14). Server functions expose a staged validator/middleware/handler API (packages/start-client-core/src/createServerFn.ts:89,115,122).

Weaknesses:
- Public barrels expose a large amount of generic machinery and utilities, increasing discovery and compatibility costs (packages/react-router/src/index.tsx:27; packages/router-core/src/index.ts:7).
- Correct inference can depend on object property order; the project supplies an autofixable lint rule specifically for this (packages/eslint-plugin-router/src/rules/create-route-property-order/create-route-property-order.rule.ts:23). Callers need tooling knowledge in addition to types.
- Compatibility names accumulate: `tanStackRouterCodeSplitter`, `tanstackRouterGenerator`, `tanstackRouter` and deprecated `TanStackRouterVite` share one plugin entry (packages/router-plugin/src/vite.ts:24,43,62,64).

Worth copying into robkit:
- Test exact inferred call signatures at the public entry point and add concise JSDoc describing the recommended use, not just parameter types.

## 3. Type safety at the edges - 6/10

What they do well:
- Root configuration enables strict checking, noUncheckedIndexedAccess and noImplicitReturns; packages extend it (tsconfig.json, compilerOptions; packages/router-core/tsconfig.json:2).
- Generator JSON is merged and parsed through Zod before use, and Start options are schema-parsed at the configuration boundary (packages/router-generator/src/config.ts:106; packages/start-plugin-core/src/schema.ts:60).
- Server functions support Standard Schema, parse-style validators and functions; validation executes on the server. Context merging removes dangerous prototype keys and uses null-prototype results (packages/start-client-core/src/createServerFn.ts:305,874; packages/start-client-core/src/safeObjectMerge.ts:2,13).

Weaknesses:
- The measured 768 `any` tokens and 135 `as any` instances are too frequent for an exemplary type-safety score, even allowing for framework generics. For example the server-function builder erases six parameters and casts transformed handler arguments (packages/start-client-core/src/createServerFn.ts:75,123).
- HTTP decoding still uses `let res: any`, `let json: any` and `payload: any` around JSON/Seroval decoding. Payload shape protection exists, but transport decoding is not uniformly represented by a validated typed envelope (packages/start-server-core/src/server-functions-handler.ts:209,252,265).
- Some public guards accept `any`, and redirect `throw` itself is typed as any (packages/router-core/src/redirect.ts:40,134,146). Three build-related ignores persist in createStartHandler.ts:130,132,134.

Worth copying into robkit:
- Infer configuration types from runtime schemas, and support Standard Schema at external application-input boundaries.
- Preserve strict compiler flags while keeping untrusted transport values `unknown` until validated.

## 4. Naming and domain language - 8/10

What they do well:
- Hook, route and runtime file names largely match concepts callers use: useNavigate, createServerFn, createMiddleware and server-functions-handler (packages/react-router/src/useNavigate.tsx:28; packages/start-client-core/src/createServerFn.ts:75; packages/start-server-core/src/server-functions-handler.ts:174).
- Streaming documentation defines precise terms such as hydration source, late record, boundary and safe point, then connects them to concrete ownership and request flow (packages/router-core/src/ssr/STREAMING.md:6,24,49).

Weaknesses:
- Plugin naming retains several capitalization styles and deprecated aliases (packages/router-plugin/src/vite.ts:24,43,64).
- Generic package metadata drifts from actual roles: router-core, router-generator and start-server-core manifests all describe modern routing for React applications even though they have different framework-independent responsibilities (their package.json description fields). `new-process-route-tree.ts` also records implementation chronology rather than its stable role.

Worth copying into robkit:
- Add a short vocabulary and ownership section beside complicated protocols, using the same terms in code and tests.

## 5. Simplicity - 6/10

What they do well:
- Runtime dependency lists are contained: four direct dependencies each for router-core, react-router and start-client-core. The React server adapter composes existing pieces in roughly 50 source lines across its package (packages/router-core/package.json; packages/react-start-server/src/defaultStreamHandler.tsx:7).
- The CLI keeps generate/watch behavior small and delegates route work to Generator; configuration has one schema and one getConfig entry (packages/router-cli/src/generate.ts:4; packages/router-generator/src/config.ts:106).

Weaknesses:
- Major behavior lives in large files: router.ts 3,055 lines, load-client.ts 2,571, compiler.ts 2,022 and generator.ts 1,664. Understanding navigation or compilation requires several stateful collaborators (packages/router-core/src/router.ts:40,46,58; packages/start-plugin-core/src/rsbuild/COMPILER_ARCHITECTURE.md:15).
- Following a server function requires accounting for the builder's transformed signature, compiler discovery, resolver metadata, request decoding and serialization (packages/start-client-core/src/createServerFn.ts:123; packages/start-plugin-core/src/rsbuild/COMPILER_ARCHITECTURE.md:35,53; packages/start-server-core/src/server-functions-handler.ts:176). Much is justified by the product, but it still falls short of a few-file trace.
- Build-time dependencies expand to 21 in start-plugin-core, and Vite/Rsbuild import protection each have substantial implementations (packages/start-plugin-core/package.json, dependencies; packages/start-plugin-core/src/vite/import-protection-plugin/plugin.ts; packages/start-plugin-core/src/rsbuild/import-protection.ts).

Worth copying into robkit:
- Make framework adapters compose shared runtime operations; keep AST transformation and platform build machinery out of runtime modules.

## 6. Consistency - 8/10

What they do well:
- React, Solid and Vue Start plugins share the same framework/default-entry/provider configuration pattern and delegate to tanStackStartVite (packages/react-start/src/plugin/vite.ts:26; packages/solid-start/src/plugin/vite.ts:15; packages/vue-start/src/plugin/vite.ts:15).
- Common target names, inherited TypeScript/ESLint configuration and repeated publint/attw checks make package workflows predictable (packages/router-core/package.json, scripts; packages/start-server-core/package.json, scripts; packages/router-core/eslint.config.js:3).
- Generator configuration types derive from schemas, and Start extends/reuses the router configuration schema (packages/router-generator/src/config.ts:22,93; packages/start-plugin-core/src/schema.ts:3,6).

Weaknesses:
- A `test:unit` target does not consistently mean tests ran: the React/Solid/Vue server adapters and vue-start-client use `exit 0; vitest` (respective package.json scripts). packages/AGENTS.md explicitly warns contributors about placeholder targets.
- Error signaling varies between tagged objects, augmented Responses and ordinary Error instances (packages/router-core/src/not-found.ts:32; packages/router-core/src/redirect.ts:118; packages/router-generator/src/config.ts, validateConfig).

Worth copying into robkit:
- Standardize package target names and shared config inheritance, and omit unavailable targets rather than advertising a successful placeholder.

## 7. Error handling - 7/10

What they do well:
- Generator diagnostics tell callers how to fix obsolete options and explain reserved prefixes (packages/router-generator/src/config.ts, validateConfig).
- Server-function requests reject mismatched HTTP methods before parsing payloads and return 405 with Allow. Error replies preserve serialization/error protocol headers (packages/start-server-core/src/server-functions-handler.ts:131,186).
- Central response handling logs unexpected errors, preserves error status semantics and returns a generic HTTPError envelope; server function calls distinguish a present error key from truthiness, allowing thrown falsy values (packages/start-server-core/src/internal-request-response.ts:676,722; packages/start-client-core/src/createServerFn.ts:162).

Weaknesses:
- Cleanup exceptions are intentionally swallowed, and malformed FormData context is only logged in development before continuing. These may be sensible recovery policies, but do not meet the rubric's no-swallowed-errors ideal (packages/start-server-core/src/server-functions-handler.ts:106,112,233).
- Production invariant failures are deliberately generic; protocol failures such as Incomplete frame are ordinary Error values rather than a common typed taxonomy (packages/router-core/src/invariant.ts:1; packages/start-client-core/src/client-rpc/frame-decoder.ts:135,210). Standard Schema issues are also flattened into an Error message (packages/start-client-core/src/createServerFn.ts:879).
- The watch CLI catches errors for its initial handle, but later event callbacks directly return generator.run promises without that same local reporting path (packages/router-cli/src/watch.ts:27,38). This is a static consistency concern, not a reproduced crash.

Worth copying into robkit:
- Centralize HTTP error reconciliation, test thrown falsy values, and validate methods before expensive body parsing.

## 8. Testing - 8/10

What they do well:
- There are 346 test/spec files across the eight principal packages, spanning runtime and type contracts. Navigation tests assert permitted routes; generator tests invoke Generator/getConfig and inspect generated outputs (packages/react-router/tests/useNavigate.test-d.tsx:38; packages/router-generator/tests/generator.test.ts:13,44,66).
- Browser regressions assert observable behavior across real navigation: a back-navigation test checks both visible article content and document title (e2e/react-start/basic/tests/issue-6221-head.spec.ts:13). Start's runner supports multiple toolchains/modes and manages its server lifecycle (e2e/react-start/basic/package.json, nx.metadata; e2e/react-start/basic/playwright.config.ts:49).
- Start compiler tests separate unit and real-build/dev-server integration projects; core/React Vitest configs enable typechecking (packages/start-plugin-core/vite.config.ts:14,25; packages/router-core/vite.config.ts:17; packages/react-router/vite.config.ts:20).

Weaknesses:
- Some tests assert internal helpers, call arity and underscore-prefixed fields, so internal refactors can break them without observable behavior changing (packages/router-core/tests/build-location.test.ts:11,43,50; packages/react-router/tests/link.test.tsx:44,92). Start handler tests also mock virtual entries and inspect internal response helpers (packages/start-server-core/tests/createStartHandler.test.ts:25,47,90).
- router-cli has no matching tests; several adapters have explicit no-op unit commands (packages/router-cli/package.json; packages/react-start-server/package.json; packages/vue-start-client/package.json). Thin wrappers are partly covered through core/e2e, but target success alone is misleading.
- No timing, coverage percentage or passing status was measured. The suite's breadth is established statically; fast feedback cannot be assumed. Performance tests are excluded from default core runs (packages/router-core/vite.config.ts:23).

Worth copying into robkit:
- Pair public inference tests with browser regressions that assert a complete user-visible outcome, and test generated code through compilation as well as snapshots.

## 9. Keeping standards up - 8/10

What they do well:
- PR CI runs affected lint, unit, integration, e2e, type and package-build targets; Nx orders/caches dependencies (package.json, test:pr; .github/workflows/pr.yml:46; nx.json, targetDefaults). Compiler matrices test source compatibility; publint and attw validate published entry/type packaging (packages/router-core/package.json, scripts).
- Custom ESLint plugins encode inference-sensitive property order, route parameter naming and server/client component constraints (packages/eslint-plugin-router/src/rules.ts:1; packages/eslint-plugin-start/src/rules.ts:1). These are shipped mechanisms; their presence does not prove every repo package enables every rule.
- Formatting and generated label config have autofix automation; changesets drive versioning/publishing, and CODEOWNERS covers tooling/workflows ( .github/workflows/autofix.yml:28; .github/workflows/release.yml; .github/CODEOWNERS:1). Workspace install policy includes a minimum release age and trust settings (pnpm-workspace.yaml:1).
- Root/nested AGENTS.md document regression-test, validation, runtime isolation and bundle rules; a separate workflow validates intent skills on relevant PRs (.github/workflows/check-skills.yml:39).

Weaknesses:
- Several written rules remain social requirements. The PR checklist asks for changesets and local testing, while CodeRabbit explicitly disables request_changes_workflow (.github/pull_request_template.md; .coderabbit.yaml:4). No evidence here establishes mandatory owner approval or branch protections.
- Local ESLint disables no-unsafe-function-type/no-shadow globally; unused variables are warnings, and core disables no-unnecessary-condition (eslint.config.js:10,23; packages/router-core/eslint.config.js:9). No measured-any or suppression ratchet was found in inspected configs.
- root test:docs exists but is not among test:pr targets, and skill validation is scoped to skills/artifacts on PRs (package.json, test:docs/test:pr; .github/workflows/check-skills.yml:24). Written guidance is broader than the visibly enforced gates.

Worth copying into robkit:
- Add publint/attw packed-package checks and a supported-TypeScript matrix to protect downstream installs.
- Turn recurring domain mistakes into focused autofixable lint rules with regression tests.

## 10. Nice to work in as a human - 8/10

What they do well:
- CONTRIBUTING.md gives concrete install/build/dev/test commands, focused test examples, changeset guidance and documentation preview instructions. Root scripts expose named affected/full-suite paths (CONTRIBUTING.md, Setup/Development/Testing and linting; package.json, scripts).
- Architecture notes explain difficult ownership/cache behavior near the code. Streaming has vocabulary and request flow; Rsbuild compiler notes name files and describe persistent-cache replay (packages/router-core/src/ssr/STREAMING.md:6,49; packages/start-plugin-core/src/rsbuild/COMPILER_ARCHITECTURE.md:13,15).
- Getting-started docs offer a working example and explicit install/dev commands; the example has a small README for the dev/build loop (docs/start/framework/react/getting-started.md:25; examples/react/start-basic/README.md:19). React/Vue plugin comments explain specific dependency-optimization decisions (packages/react-start/src/plugin/vite.ts; packages/vue-start/src/plugin/vite.ts).

Weaknesses:
- Per-package onboarding can be minimal: router-core's README is just a heading and external docs link (packages/router-core/README.md:3). Finding internal design relies on scattered nearby notes and root guidance.
- `pnpm dev` first builds all packages, workspace imports consume built dependencies, and docs preview needs a second sibling repository with a fixed folder name (package.json, dev/watch; AGENTS.md, Work and validation; CONTRIBUTING.md, Documentation). These are real setup steps even though Nx helps subsequent builds.
- General debugging examples use different runner forms from the prescriptive Nx instructions; the user must reconcile DEBUGGING.md:19 with AGENTS.md's validation guidance. Large core files also make a first change harder to localize (packages/router-core/src/router.ts; packages/start-plugin-core/src/start-compiler/compiler.ts).

Worth copying into robkit:
- Document one focused validation command and place ownership/flow notes beside complex code, including the reason a surprising cache or bundler constraint exists.

## Top 5 practices to copy

1. Protect public inference as a first-class contract. Add exact destination/input/output type assertions and compile supported TypeScript versions (packages/react-router/tests/useNavigate.test-d.tsx:38; packages/router-core/package.json, test:types scripts).
2. Validate the package consumers actually install. Run strict publint and attw packaging checks alongside the build (packages/router-core/package.json, test:build; packages/start-server-core/package.json, test:build).
3. Keep framework bindings thin over shared cores. Compose framework rendering at the adapter while retaining request/routing semantics in common packages (packages/react-start-server/src/defaultStreamHandler.tsx:7; packages/solid-start/src/plugin/vite.ts:15).
4. Encode difficult usage rules in tooling. Turn inference-sensitive ordering and client/server boundaries into lint/build diagnostics (packages/eslint-plugin-router/src/rules/create-route-property-order/create-route-property-order.rule.ts:23; packages/start-plugin-core/src/import-protection/defaults.ts:17).
5. Write local architecture notes that identify ownership and lifecycle. Define protocol vocabulary, then show request flow and cache replay beside the implementation (packages/router-core/src/ssr/STREAMING.md:6,49; packages/start-plugin-core/src/rsbuild/COMPILER_ARCHITECTURE.md:13,15).
