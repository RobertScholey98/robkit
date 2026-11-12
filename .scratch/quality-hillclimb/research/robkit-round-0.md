# robkit quality report

Commit: a4c510995a79a3e622aba99dc99f70b6f6c5f93d. Scope: all eight package manifests and public entry points; representative implementation and tests across core, guard, session, adapters, dev and create-robkit; all seven tooling package manifests; custom lint rules, repo checks, matrix planner, representative browser and production harnesses; root configuration; all four GitHub workflows; docs/agents; representative generated install, ORM and UI layers. Read CLAUDE.md, AGENTS.md and GLOSSARY.md first. Read .scratch/kit/map.md only for category 10 context. Did not inspect the remote spec, every template component, generated Prisma internals, dependency source, or every test assertion. No dependency installation or repository changes. No lint, typecheck or tests executed because node_modules is absent. CI configuration is evidence of intended gates, not proof that this commit passes them or that remote branch protection requires them.

Scores use the rubric's absolute scale: 5 is a decent typical TypeScript project, 7 is clearly above average, 9 is exemplary. The project's age does not excuse gaps.

## Scores

| # | Category | Score | One-line reason |
| --- | --- | --- | --- |
| 1 | Module boundaries | 8/10 | Small adapters and a pure guard, backed by tested layer rules; enforcement is incomplete. |
| 2 | Public API design | 7/10 | Small exports and useful discriminated unions; permissive configuration and sparse usage documentation. |
| 3 | Type safety at the edges | 6/10 | Strong compiler settings and HTTP/token readers; unchecked file/config casts remain. |
| 4 | Naming and domain language | 8/10 | Glossary vocabulary maps closely to files and types; stack/generator remains inconsistent. |
| 5 | Simplicity | 7/10 | Direct request paths and data-driven choices; generator, deploy and harness code carry concentrated complexity. |
| 6 | Consistency | 8/10 | Shared configurations, input readers and template seams; IO validation and failure conventions vary. |
| 7 | Error handling | 6/10 | Helpful expected-failure messages and tagged outcomes; operational causes can disappear. |
| 8 | Testing | 8/10 | Public behavior, shared conformance cases and substantial generated-install journeys; slow gates and limited browser breadth. |
| 9 | Keeping standards up | 8/10 | Architecture, catalog, packed exports and generated installs have machine checks; release/API governance is missing. |
| 10 | Nice to work in as a human | 4/10 | Excellent agent-oriented guidance, but no project/package READMEs or contribution guide. |

## Measurements

Counts are of tracked files from `git ls-files`, not node_modules or .scratch. Code means .ts, .tsx and .js under packages/ and tooling/. Non-test excludes filenames containing `.test.`, directories `/test/`, and `/__snapshots__/`. E2E helper modules remain included. Line counts include comments and blanks, with trailing whitespace trimmed before splitting lines.

| Measurement | Result |
| --- | --- |
| Top-level workspaces | 8 packages plus 7 tooling packages |
| All code | 311 files, 29,088 lines |
| Non-test code including templates/generated code | 223 files, 18,307 lines |
| Non-test code excluding all templates | 114 files, 10,242 lines |
| Test files | 79 total, 71 outside templates; this is file count, not executed test count |
| Shared guard conformance cases | 17 in packages/guard/conformance.json |
| External dependency names in 15 workspace manifests | 23 unique across dependencies/devDependencies/optionalDependencies; excludes peer dependencies and root/template manifests |
| External runtime dependency names in eight package manifests | 7 unique: @clack/prompts, drizzle-orm, hono, jose, postgres, prettier, yaml; excludes peers |
| Root dependency catalog | 51 entries, pnpm-workspace.yaml:8 |
| Project and package READMEs | 0; only tracked README is .skills/README.md |
| Root docs/ | 3 files, all under docs/agents/ |
| GitHub workflows | 4: ci.yml, kit-matrix.yml, nightly.yml, production.yml |
| Contributor/release governance files found | No CONTRIBUTING, CODEOWNERS, SECURITY, project LICENSE, PR template or changeset files; vendored skill licenses exist |
| Dependencies available locally | node_modules absent |
| Working tree | `git status --short` empty before research |

Textual token counts, deliberately not presented as AST counts:

| Non-test scope | `any` | `as` | `as const` subset | @ts-ignore | @ts-expect-error | eslint-disable |
| --- | --- | --- | --- | --- | --- | --- |
| Excluding templates | 17 | 276 | 12 | 0 | 0 | 0 |
| Including templates/generated Prisma | 54 | 453 | 33 | 0 | 0 | 10 |

These regex counts include comments, strings and import aliases. Inspecting all 17 `any` matches outside templates found only prose comments, not explicit any types. `as` is not a cast count; actual unchecked assertions include add.ts:43, apps.ts:36, coolify.ts:41 and robkit.ts:184. Generated/template code should not be conflated with authored library safety.

Largest non-test files:

| Path | Lines |
| --- | --- |
| packages/create-robkit/templates/orms/prisma/app/src/generated/prisma/models/Visit.ts | 1,150 |
| packages/create-robkit/templates/orms/prisma/app/src/generated/prisma/internal/prismaNamespace.ts | 832 |
| tooling/e2e/src/production-stack.ts | 533 |
| packages/create-robkit/src/coolify.ts | 485 |
| packages/create-robkit/src/generate.ts | 479 |
| tooling/e2e/src/install-journeys.ts | 448 |
| packages/core/src/app.ts | 427 |
| packages/create-robkit/templates/ui-kits/none/apps/admin/src/client/Admin.tsx | 354 |

Commands used: `git rev-parse HEAD`, `git status --short`, `git ls-files`, `git log -6 --oneline`, `rg --files`, targeted `rg -n` searches for imports, schema declarations, casts, any, suppressions, catches, coverage and type assertions; numbered `Get-Content` reads. Read-only Node scripts used fs and git ls-files to count lines/tokens, inspect manifest exports/dependencies, count catalog entries and parse conformance.json. An initial Python counting attempt failed because Python is unavailable; counting was completed with Node. Some initial shell glob/path reads failed and were corrected with actual paths or rg directory filters. No suite timings, pass counts, coverage percentages or remote check results were measured.

## 1. Module boundaries - 8/10

What they do well:
- The guard is a zero-dependency decision function with a compact explicit entry point. Its state and outcome unions expose the model without persistence or framework plumbing (packages/guard/src/index.ts:1; packages/guard/src/guard.ts:5,28,33,79; packages/guard/package.json).
- Session owns request-level verification and core HTTP access. Hono and Start only translate its decision into framework behavior (packages/session/src/request-guard.ts:100; packages/hono/src/guarded.ts:17; packages/start/src/guarded.ts:33). The reviewed source imports follow the documented direction: adapters use session/guard, session uses guard/jose, and none imports core.
- Rules prohibit framework imports in session/guard, built-in IO and named IO globals in guard, and both package and relative core imports in adapters (tooling/eslint/layers.js:26,37,85). Rules have their own tests (tooling/eslint/layers.test.js).
- Core declares eight tables through core.table in its own schema, matching the written rule (packages/core/src/schema.ts:14,19,33,49,56,70,91,104,126). A dedicated lint rule checks Drizzle declarations (tooling/eslint/core-schema.js:33).
- Generated apps get a TypeScript-parser-based layer checker independently of ESLint (packages/create-robkit/src/check.ts:48,153,208).

Weaknesses:
- The framework rule is a finite denylist, not a complete allowed dependency graph. It does not prevent an unlisted framework or an IO-capable third-party library in guard; computed imports are ignored (tooling/eslint/layers.js:26,49,120). There is no general cycle or cross-package internal-import check in the shared config (tooling/eslint/index.js).
- The install checker visits apps, not shared packages, so a shared package can conceal a forbidden dependency from an app's direct import scan (packages/create-robkit/src/check.ts:208).
- The proxy-only reachability rule is partly an operational assumption. Core defaults to loopback, but HOST overrides it and trusted forwarding headers then depend on network isolation (packages/create-robkit/templates/base/apps/core/src/main.ts:30; packages/core/src/client.ts:17).

Worth copying into robkit:
- Raise this toward 9 by enforcing an allowed workspace dependency graph, including shared install packages and relative imports, with rule tests for bypasses. Keep the existing tiny adapters and pure guard as the reference shape.

## 2. Public API design - 7/10

What they do well:
- React exports one helper; Hono exposes guarded and the corresponding context/options types. Core's entry point is six export statements rather than its schema and route internals (packages/react/src/index.ts:1; packages/hono/src/index.ts:1; packages/core/src/index.ts:1).
- Guard decisions and viewers are discriminated unions. The browser-safe lapsed and addresses subpaths keep callers away from server verification internals (packages/guard/src/guard.ts:5; packages/session/package.json; packages/session/src/index.ts).
- Start documents its context registration and why guarding belongs in the server entry (packages/start/src/guarded.ts:7,23). readSessionToken explicitly documents bad-token versus key-loading failure behavior (packages/session/src/session-token.ts:61).

Weaknesses:
- Most consumers must infer setup from source/template files. There are no package READMEs, runnable API examples linked from an entry document, or documented compatibility/version policy (tracked-file inventory; packages/start/src/guarded.ts:7 is a useful local exception).
- GuardedRule's structural union lacks mutually exclusive never fields, allowing a variable carrying both access and app to satisfy the type; requestGuard silently gives access precedence (packages/session/src/request-guard.ts:14,105). Slugs and origins remain plain strings.
- @robkit/dev exposes discovery, routing, database password derivation, individual provisioning and the whole runner together. The intended stable consumer surface versus composition helpers is not explained (packages/dev/src/index.ts:1).
- sessionFetch deliberately never settles after navigation. This is documented but has no cancellation path if navigation does not complete (packages/react/src/session-fetch.ts:19,32).

Worth copying into robkit:
- Raise the score by adding a minimal executable example and failure contract for each public package, making access/app mutually exclusive, and explicitly identifying the supported dev API surface.

## 3. Type safety at the edges - 6/10

What they do well:
- strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride and verbatimModuleSyntax are centrally enabled (tooling/typescript/base.json:7). The shared ESLint config adds strict type-aware checks (tooling/eslint/index.js:27).
- JSON HTTP bodies enter core as unknown and go through concern-specific readers. Token claims validate subject/session identifiers, kind and role lists rather than trusting JWT payload types (packages/core/src/app.ts:83,94; packages/session/src/session-token.ts:51).
- Access rules fetched over HTTP are read at the boundary; the request has a five-second timeout (packages/session/src/core-access.ts:29). Trusted proxy configuration accepts only one known literal (packages/core/src/client.ts:7).
- No explicit any types were found among the 17 non-template textual matches; no authored non-test lint suppressions or ts-ignore directives were found.

Weaknesses:
- robkit.json is parsed directly as Choices, without checking choices, option versions or container shape (packages/create-robkit/src/add.ts:32,43). A syntactically valid `{}` reaches generators.includes and fails incidentally instead of producing a configuration error.
- App manifests are asserted as PackageJson; scripts and robkit shapes are not parsed (packages/dev/src/apps.ts:29,34). checkInstall similarly asserts manifest.name, later passing it to string matching (packages/create-robkit/src/check.ts:127).
- readCoolifyConfig checks individual strings but first asserts the JSON root as a record. JSON null produces a property-access exception; the final assertion substitutes for a complete typed constructor (packages/create-robkit/src/coolify.ts:40,59).
- PORT uses Number without integer/range validation in the generated core launcher (packages/create-robkit/templates/base/apps/core/src/main.ts:34). File/config edges receive materially weaker validation than HTTP/token edges.

Worth copying into robkit:
- Raise this to 7 or 8 with unknown-to-value readers for robkit.json, manifests, Coolify configuration and environment values, plus malformed/null/wrong-shape tests. Centralize these readers so add, dev, deploy and check agree.

## 4. Naming and domain language - 8/10

What they do well:
- The glossary defines owner, guest, install, viewer, access code, role and guard, including forbidden synonyms (GLOSSARY.md). Those names appear directly in public types, route files and tests (packages/guard/src/guard.ts:9,15,25; packages/core/src/access-codes.ts; packages/core/src/guest-roles.test.ts).
- Concern names give useful search targets: request-guard, session-token, install-addresses, provision, readDeclaredApps and slugProblem (packages/session/src/index.ts; packages/dev/src/index.ts; packages/core/src/index.ts).
- Tests describe concrete user behavior instead of implementation method names, for example racing setup and role-gated access (packages/core/src/setup.test.ts:156; tooling/e2e/src/install-journeys.ts:399).

Weaknesses:
- A stack is still publicly called Generator and exposed through --generators, while add calls the same value stack (packages/create-robkit/src/choices.ts:162,234,259; packages/create-robkit/src/add.ts:21). This is a real terminology split, not just an internal abbreviation.
- GLOSSARY.md's final section itself records unresolved generator and layer ambiguities. Plain string roles also require comments to distinguish role names from role IDs (packages/guard/src/guard.ts:1; packages/create-robkit/src/add.ts:24).

Worth copying into robkit:
- Raise this toward 9 by converging stack/generator vocabulary, with an explicit CLI/config migration if needed. Use RoleId/RoleName distinctions at boundaries where confusing the two changes access behavior.

## 5. Simplicity - 7/10

What they do well:
- The Hono adapter is 27 lines and Start adapter 49. The pure guard is a direct exhaustive table rather than a chain of middleware abstractions (packages/hono/src/guarded.ts; packages/start/src/guarded.ts; packages/guard/src/guard.ts:44).
- init has one visible sequence: generate, write, optionally initialize git and install dependencies (packages/create-robkit/src/init.ts:22). No framework-sized orchestration layer sits between the CLI and generator.
- Choices and package-manager differences are data-driven, preventing parallel option implementations in the wizard, generator and CI matrix (packages/create-robkit/src/choices.ts:162; packages/create-robkit/src/package-managers.ts; tooling/matrix/src/combinations.ts).
- Eight shipped package manifests have only seven unique external runtime dependency names. The guard itself has none (manifest measurements).

Weaknesses:
- Generator merging/spelling, Coolify synchronization and production orchestration concentrate complexity in 479-, 485- and 533-line modules respectively (packages/create-robkit/src/generate.ts; packages/create-robkit/src/coolify.ts; tooling/e2e/src/production-stack.ts).
- Following generated output requires understanding layer precedence, JSON deep merging, manager command rewriting, UI opt-in layers and tool omission. These are purposeful features, but they cost more than the short CLI suggests (packages/create-robkit/src/generate.ts:88,148,159,219,323).
- Most HTTP routes and middleware assembly remain in one 427-line createApp module (packages/core/src/app.ts:121). It is still readable, but increasingly expensive to hold in mind.

Worth copying into robkit:
- Raise the score by giving generator transformations small explicit input/output contracts and an inspectable composition trace. Extract a coherent module only where it hides a complete concern, such as Coolify transport, rather than splitting solely by file length.

## 6. Consistency - 8/10

What they do well:
- Every published package uses the same build/lint/typecheck/test naming and shared TypeScript/ESLint configurations (packages/*/package.json; tooling/typescript/base.json; tooling/eslint/index.js).
- Core routes consistently use read-prefixed input rules and domain results before mapping to HTTP responses (packages/core/src/app.ts:266,351,382,398,412).
- Generated hub/admin share callCore's result/reader protocol, and UI kit variants use a ui.tsx seam rather than replacing whole screens (packages/create-robkit/templates/base/packages/core-client/src/call-core.ts:1,17; packages/create-robkit/templates/ui-kits/none/apps/admin/src/client/Admin.tsx; packages/create-robkit/templates/ui-kits/chakra/install).
- Dependency versions and relative import spelling have mechanical checks instead of relying on author preference (tooling/repo-checks/src/catalog.ts:33; tooling/eslint/relative-import-extension.js).

Weaknesses:
- HTTP input uses unknown-to-value readers, while filesystem JSON often uses assertions. This makes identical classes of invalid input behave differently across entry points (packages/core/src/app.ts:83; packages/create-robkit/src/add.ts:43; packages/dev/src/apps.ts:36).
- Failures appear as outcome unions, ok results, undefined, exceptions and boolean deployment success. Each can be appropriate, but there is no documented convention for choosing one (packages/guard/src/guard.ts:33; templates/base/packages/core-client/src/call-core.ts:2 under packages/create-robkit; packages/create-robkit/src/coolify.ts:447).

Worth copying into robkit:
- Raise this toward 9 by documenting a short boundary/error convention and applying the existing reader pattern to file and environment input. Keep concern-specific domain outcomes rather than introducing one oversized universal result type.

## 7. Error handling - 6/10

What they do well:
- Expected domain failures are explicit: unclaimed/taken/wrong/refused and unknown-role/app lead to intentional HTTP statuses and helpful messages (packages/core/src/app.ts:266,298,324,385,402).
- Adapter failure to verify identity produces 503 rather than treating the caller as signed out. Bad tokens are distinguished from key-loading failures (packages/session/src/request-guard.ts:123; packages/session/src/session-token.ts:61,80).
- CLI errors frequently contain corrective actions, such as choosing another slug or running add inside an install (packages/create-robkit/src/add.ts:38,68). Proxy failures name the app and port (packages/dev/src/proxy.ts:74).
- Coolify failures retain HTTP/body context, detect successful responses that queued nothing, stop later deployment waves and report each app's result (packages/create-robkit/src/coolify.ts:119,378,475).

Weaknesses:
- requestGuard catches all session/rule exceptions and drops their cause. An unknown app, malformed rule and network outage all become the same generic reachability response, without a diagnostic hook (packages/session/src/request-guard.ts:125,133).
- Core's health check intentionally hides DB exceptions, and createApp installs no explicit centralized error reporter or structured unexpected-error response policy (packages/core/src/app.ts:225,426). Safe public messages need an accompanying operator-visible cause.
- Coolify fetch has no AbortSignal timeout. Its deployment polling deadline is checked only after call returns, so a stalled request can defeat the intended timeout (packages/create-robkit/src/coolify.ts:103,386,409).
- Malformed configuration shapes can leak raw TypeError or JSON parsing errors (packages/create-robkit/src/add.ts:43; packages/create-robkit/src/coolify.ts:41).

Worth copying into robkit:
- Raise this to 7 or 8 by preserving error causes through an injectable server diagnostic callback, bounding every outbound deployment request, and returning file/key-specific configuration errors. Keep expected auth failures separate from infrastructure faults.

## 8. Testing - 8/10

What they do well:
- Seventeen conformance fixtures are exercised through guard and framework public interfaces. Hono tests inspect status, redirect and viewer rather than mocking the decision function (packages/guard/conformance.json; packages/guard/src/guard.test.ts:37; packages/hono/src/guarded.test.ts:12).
- Core tests include malformed bodies, cookie properties, signed token claims, stored password hashing and racing setup requests against a real database fixture (packages/core/src/setup.test.ts:15,59,83,156,198).
- Generated-install tests run the install's own CI steps, on a PATH without accidental workspace binaries (tooling/e2e/src/combination.test.ts:7; tooling/e2e/src/clean-path.ts). Matrix tests verify pair coverage and that a new option expands the plan (tooling/matrix/src/combinations.test.ts:40,76).
- Browser journeys assert role access, added apps, theme-token behavior and axe results; production jobs cover three install variants over TLS (tooling/e2e/src/install-journeys.ts:350,362,380,399; tooling/e2e/src/production.test.ts; .github/workflows/production.yml:33).
- Resource cleanup survives the test process dying, reducing contamination of later runs (tooling/test-postgres/src/clean-up.ts:30).

Weaknesses:
- The ordinary test graph includes costly infrastructure. Role journeys intentionally wait through cache lifetimes and allow five minutes; yarn setup permits ten minutes (tooling/e2e/src/install-journeys.ts:399; tooling/e2e/src/yarn-prune.test.ts:78). Unit packages can be run separately, but there is no equally obvious root fast-test command (package.json).
- CI installs Chromium only, leaving cross-browser behavior outside this gate (.github/workflows/ci.yml:37). Accessibility scans are useful but do not replace keyboard/manual interaction coverage.
- No configured code-coverage threshold or dedicated negative public-API type tests were found. These are gaps in visibility and API misuse protection, not proof that current behavioral coverage is poor.
- Some tests deliberately inspect storage format or exact visual tokens, so the whole suite is not refactor-independent (packages/core/src/setup.test.ts:83; tooling/e2e/src/install-journeys.ts:365).

Worth copying into robkit:
- Raise this toward 9 with a documented fast gate, negative compile-time API tests and targeted browser/keyboard checks for supported browsers. Measure suite duration/flakiness and coverage before choosing thresholds. Current suite health remains unverified in this checkout.

## 9. Keeping standards up - 8/10

What they do well:
- Shared strict lint rules include architecture, core schema and relative extensions, with dedicated rule tests (tooling/eslint/index.js:40; tooling/eslint/layers.test.js; tooling/eslint/core-schema.test.js; tooling/eslint/relative-import-extension.test.js).
- Catalog checks recursively inspect manifests, including templates, and packed-package checks ensure exports/bins target shipped JS (tooling/repo-checks/src/catalog.ts:48; tooling/repo-checks/src/catalog.test.ts:71; tooling/repo-checks/src/published.test.ts:39).
- CI uses frozen installation, formatting, lint, types and tests, plus generated-install matrix jobs. The matrix has a stable aggregate failure gate ( .github/workflows/ci.yml; .github/workflows/kit-matrix.yml:63).
- The generator propagates standards into installs, including robkit check, tool-specific instructions and optional Husky hooks, instead of merely documenting them (packages/create-robkit/src/check.ts; packages/create-robkit/templates/tools/husky; packages/create-robkit/templates/base/AGENTS.md).
- Production checks run on main, nightly and labelled PRs, with no fail-fast masking of other variants (.github/workflows/production.yml:8,22,30). Templates are excluded from local library lint/types intentionally and exercised as generated installs (packages/create-robkit/eslint.config.js:4; tooling/e2e/src/combination.test.ts).

Weaknesses:
- No release/versioning automation, changesets, API compatibility report, ownership file or PR template was found. Packing checks artifact shape, not consumer compatibility across releases (tooling/repo-checks/src/published.test.ts:44; tracked-file inventory).
- Written architecture rules have the enforcement limits described in category 1. Commit discipline and domain language remain instructions, without equivalent mechanical gates (CLAUDE.md; GLOSSARY.md).
- Production validation is conditional on PR labels, and remote required checks/branch protection cannot be established by reading this checkout (.github/workflows/production.yml:22). The stable aggregate job is suitable for protection but does not configure it.

Worth copying into robkit:
- Raise this toward 9 with a versioned API/release policy, consumer compatibility checks, explicit ownership and verified required checks. Use changed-path logic for mandatory production validation where runtime/container changes warrant it.

## 10. Nice to work in as a human - 4/10

What they do well:
- AGENTS.md gives commands, a detailed architecture map, layout and constraints; GLOSSARY.md explains the domain. A technically experienced contributor can find important implementation seams from these files.
- package.json offers create-install and conventional lint/typecheck/test/format commands. init and linked installs provide a realistic sandbox (package.json:10; packages/create-robkit/src/init.ts:22).
- The generated install includes a concrete Coolify runbook with variables, dry-run behavior and one-time setup (packages/create-robkit/templates/base/docs/deploy.md:1).
- Comments explain non-obvious decisions, such as Start's server-only wrapper, WebKit cookie behavior and cleanup surviving worker death (packages/start/src/guarded.ts:30; packages/core/src/app.ts:158; tooling/test-postgres/src/clean-up.ts:30).
- The plan records known gaps candidly, including Windows/WSL requirements and operational limitations (.scratch/kit/map.md, Known gaps). This is context evidence only, not independent proof of those runtime claims.

Weaknesses:
- There is no root README, package README or CONTRIBUTING. docs/ has only agent workflow instructions, not a human getting-started or architecture guide (tracked-file inventory; docs/agents/domain.md).
- Primary architectural decisions live in .scratch tickets and a long map, with another spec on an external Claude artifact. There is no durable public docs/adr or equivalent entry path (CLAUDE.md:7; docs/agents/domain.md:5).
- AGENTS.md is thorough but dense. It does not give a newcomer a short worked change, a fast validation loop, or an upfront supported-host checklist. Native Windows limitations appear in planning context, while the runner uses POSIX negative process-group IDs (packages/dev/src/runner.ts:17,27; .scratch/kit/map.md, Known gaps).
- No project license was found. This makes community reuse harder to assess independently of the technical scaffold. Root test runs require Docker, and this checkout cannot be evaluated immediately without installing dependencies (AGENTS.md, Commands; local node_modules check).

Worth copying into robkit:
- Raise this to 6 with a root quickstart, CONTRIBUTING covering Node/pnpm/Docker and WSL, a first-change walkthrough and fast test commands, plus package READMEs with runnable examples. Move settled architecture decisions into durable docs and resolve the project license. A documented fresh-machine setup exercise would support a higher score.

## Top 5 practices to copy

Ranked practices already present in robkit and worth preserving as it grows:

1. Share one conformance contract between the pure policy and framework adapters. It tests observable integration behavior while keeping adapters small (packages/guard/conformance.json; packages/hono/src/guarded.test.ts:12).
2. Turn architectural prose into tested lint rules and an install checker that survives optional tooling (tooling/eslint/layers.js:37; packages/create-robkit/src/check.ts:48).
3. Generate options and the CI matrix from one choice table, then execute each generated install's own checks (packages/create-robkit/src/choices.ts; tooling/matrix/src/combinations.test.ts:76; tooling/e2e/src/combination.test.ts:7).
4. Check packed artifacts, not just workspace source, and test production dependency closure in actual images (tooling/repo-checks/src/published.test.ts:39; tooling/e2e/src/extraneous-packages.js; tooling/e2e/src/production-stack.ts).
5. Make test resource cleanup survive interrupted workers and include failure diagnostics in browser/production harnesses (tooling/test-postgres/src/clean-up.ts:30; tooling/e2e/src/browser.ts; tooling/e2e/src/production-stack.ts).
