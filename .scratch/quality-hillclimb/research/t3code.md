# T3 Code quality report

Commit: 25b53299b75d4d8d1d0667ad47e9cfed3749776e. Scope: static research on the supplied shallow clone of pingdotgg/t3code. Read representative server workspace/project services, WebSocket handlers, orchestration V2 interfaces and transaction code, provider interfaces, contracts, client-runtime operations and RPC types, desktop preload, web test infrastructure, and mobile setup. Read root manifests, TypeScript and Vite+ configuration, custom lint registration, CI and Windows workflows, release smoke scripts, contributor instructions, architecture/glossary/service documentation, and development documentation. Counts cover all tracked apps/*/src and packages/*/src TypeScript under the exclusions below; findings are a sample-based assessment, not an exhaustive audit of nearly a million source lines.

Skipped: .repos/ reference checkouts (24,120 tracked files), dependency/lockfile contents, binary assets, vendored code, generated code, fixtures and recorded transcripts, mobile generated native projects, and build output. For source measurements, excluded path segments fixture, fixtures, __fixtures__, vendor, Vendor, generated, _generated, node_modules, dist, dist-electron, schema, android and ios; also .gen.*, .graphql.ts and uniwind-types.d.ts. Test/support files were counted separately. Marketing, infrastructure, native implementations, and evals were not assessed in depth. Read scripts that consume fixtures, without inspecting fixture payloads. No installs, builds, tests, network requests, commits, or repository edits were performed. Git status was clean at inspection.

## Scores

| # | Category | Score | One-line reason |
| --- | --- | --- | --- |
| 1 | Module boundaries | 7/10 | Good service and package seams, with targeted enforcement, but broad shared packages and central modules weaken encapsulation. |
| 2 | Public API design | 7/10 | Typed service contracts and explicit subpaths are useful; export surfaces and compatibility APIs are substantial. |
| 3 | Type safety at the edges | 8/10 | Strict checking and schemas cover important server edges; IPC casts and deliberately permissive schemas remain. |
| 4 | Naming and domain language | 8/10 | A useful glossary matches domain modules; overlapping lifecycle terms and V2 names add learning cost. |
| 5 | Simplicity | 5/10 | Small services are clear, but large orchestration/adapters and Effect composition make whole features hard to trace. |
| 6 | Consistency | 7/10 | Strong recurring service patterns, with visible legacy shape conventions and platform-specific exceptions. |
| 7 | Error handling | 8/10 | Tagged failures, context, causes, and explicit recovery are strong; silent catches and coarse messages prevent an exemplary score. |
| 8 | Testing | 8/10 | Extensive behavior tests, deterministic synchronization, browser checks, and packaged smoke paths; platform and speed gaps remain. |
| 9 | Keeping standards up | 9/10 | Custom lint rules, Effect diagnostics, unused-export checks, generated-code checks, and CI enforce many actual rules. |
| 10 | Nice to work in as a human | 7/10 | Useful runbooks and isolated dev tooling, but steep Effect/domain onboarding and sparse package documentation. |

Scores use the rubric's absolute scale: 5 is a typical decent TypeScript project, 7 is clearly above average, and 9 is exemplary. They describe the checked-out revision, not the project's reputation or current upstream state.

## Measurements

Commands ran from the clone root: `git rev-parse HEAD`, `git log -1 --format='%H %s'`, `git status --short`, `git ls-files`, `rg --files`, targeted `rg -n` searches, `Get-Content` reads, and dependency-free Node scripts reading tracked files and JSON manifests. Python was unavailable; the successful measurement pass used Node. An initial Node inventory exceeded its subprocess output buffer; rerunning with a 20 MB buffer succeeded. Initial counts included _generated files; only the corrected exclusions and counts below are used in scoring.

| Measurement | Result | Method / evidence |
| --- | --- | --- |
| Tracked files | 31,607 | `git ls-files` split into paths. |
| Reference checkout files excluded | 24,120 | Tracked paths starting `.repos/`. |
| Apps / packages | 5 / 30 | Immediate directories and package.json files under apps/ and packages/. Apps are server, web, desktop, mobile, marketing. |
| Filtered src TypeScript files | 5,713 | Tracked apps/packages paths containing `/src/`, ending .ts or .tsx, with stated exclusions. |
| Production src files / lines | 3,884 / 925,611 | Excluded test/support predicate below; lines = `text.trimEnd().split('\n').length`. Includes declarations and source comments. |
| Test/support src files | 1,829 | Names containing `.test.`, `.spec.`, `.testkit.`, or directory segments test, tests, testing, testkit, integration. Not a count of test cases. |
| Test/spec files across apps/packages | 1,813 | Same generated/fixture exclusions, filenames matching `\.(test|spec)\.[cm]?[jt]sx?$`; includes files outside src. |
| `any` word tokens / approximate type positions | 439 / 40 | Regex `\bany\b` and `[:<,|&]\s*any\b` in production source. Includes comments/strings; second regex is not an AST count. |
| `as` word tokens / namespace imports / `as const` | 16,360 / 8,914 / 2,770 | Regex scans. `as` includes imports, prose and narrowing; it is NOT a count of unsafe casts. |
| `as unknown` sequences | 76 | Regex `\bas unknown\b`; includes some harmless narrowing such as JSON to unknown. |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | 0 / 0 / 0 | Literal substring counts in production sample; not all forms of compiler/linter suppression. |
| `oxlint-disable` occurrences | 663 | Literal substring scan; many are documented exceptions. Effect diagnostic suppression comments are a separate mechanism and not included. |
| `Effect.ignore` references / empty Promise catches | 366 / 33 | Regex `Effect\.ignore\b` and `\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)`; these flag review sites, not 399 proven bugs. |
| Explicit export keys: client-runtime / shared / provider-core | 132 / 132 / 46 | `Object.keys(manifest.exports).length`. Separate subpaths can be legitimate, but are not a tiny public surface. |
| Contracts barrel | 74 export statements | Lines starting `export ` in packages/contracts/src/index.ts. |
| Package READMEs | 1 of 30 | Tracked `packages/<name>/README*`: packages/client-runtime/README.md. Other docs live centrally. |
| Direct dependencies: server / web / desktop / mobile | 39 / 79 / 20 / 87 | `dependencies` only, including workspace dependencies. |
| External direct dependencies: server / web / desktop / mobile | 21 / 73 / 15 / 84 | Above entries whose version does not start `workspace:`. Excludes devDependencies and transitive packages. |
| Turbo config | None found outside references | Tracked non-.repos paths containing `turbo`: none. This revision uses Vite+ task configuration in vite.config.ts, not Turbo. |

Largest measured production files:

| Lines | Path |
| --- | --- |
| 14,556 | apps/server/src/orchestration-v2/Orchestrator.ts |
| 12,335 | apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts |
| 9,417 | packages/provider-acp/src/server/adapter.ts |
| 8,060 | apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts |
| 7,476 | apps/server/src/orchestration-v2/ProjectionStore.ts |
| 5,157 | apps/server/src/vcs/GitVcsDriverCore.ts |
| 4,581 | apps/web/src/composerDraftStore.ts |
| 4,341 | packages/contracts/src/orchestrationV2.ts |

Reproduction recipe for counts: obtain tracked paths using `execSync('git ls-files', {encoding:'utf8', maxBuffer:20000000})`; normalize them as Git's slash paths; select `^(apps|packages)/`, `/src/`, and `\.tsx?$`; apply the exclusions stated in Scope; classify tests with `\.(test|spec|testkit)\.|/(test|tests|testing|testkit|integration)/`; read production files with `readFileSync(path, 'utf8')`; sum regex matches and trimmed line counts. All token counts are lexical indicators, not verified type escapes. These counts do not establish coverage, performance, or correctness.

## 1. Module boundaries - 7/10

What they do well:
- Packages distinguish contracts, shared runtime, client behavior, provider integrations, and source-control integrations. A forge has just shared-definition and server-driver exports, for example packages/source-control-github/package.json:6. Client-runtime explicitly has no root export and documents platform injection and narrow domain imports in packages/client-runtime/README.md.
- Effect services expose requirements through their environment instead of importing concrete global instances. WorkspacePaths declares its two operations at apps/server/src/workspace/WorkspacePaths.ts:83 and obtains filesystem/path services at :106. This gives tests and callers a meaningful dependency seam.
- Actual transaction code separates commit from publication and protects cancellation/ordering at apps/server/src/orchestration-v2/EventSink.ts:257 and :271. This backs the architecture's durable-intent boundary rather than merely naming folders after layers.
- vite.config.ts restricts imports into source-control shared definitions and prevents server code importing forge client entries. tsconfig.effect.json makes missing service dependencies and leaking requirements errors.

Weaknesses:
- Encapsulation is uneven. Shared and client-runtime each expose 132 subpaths, and the contracts root re-exports 74 modules. packages/shared/package.json and packages/contracts/src/index.ts show that one entry point does not explain the package.
- Import restrictions target known cross-layer hazards, not a general complete dependency graph policy. No universal package-cycle or architecture-boundary rule was found in vite.config.ts or oxlint-plugin-t3code/index.ts. Package export maps still provide useful partial enforcement.
- apps/server/src/ws.ts is thousands of lines and Orchestrator.ts is 14,556. Good conceptual boundaries coexist with very large internal coordination points.

Worth copying into robkit:
- Restrict cross-layer imports mechanically at the exact seam, including shared code importing client-only or server-only implementations.
- Make external dependencies replaceable through a service interface, with tests supplying filesystem/network implementations rather than mocking domain logic.

## 2. Public API design - 7/10

What they do well:
- WorkspacePaths gives each operation an explicit result and failure union (apps/server/src/workspace/WorkspacePaths.ts:83). The interface is sufficient to know which failures a caller must handle.
- ProviderAdapter defines schema-backed normalized events instead of exposing arbitrary provider SDK objects (packages/provider-core/src/server/ProviderAdapter.ts:50 and :86). ProviderHost separates credentials, paths, and settings capabilities (packages/provider-core/src/server/ProviderHost.ts:15).
- Explicit subpath export maps and the client-runtime README make intended consumption discoverable. Source-control-github's two public paths are especially clear (packages/source-control-github/package.json:6).

Weaknesses:
- The 132-path runtime APIs and 46-path provider-core API are not small. Their consumers need domain and Effect knowledge in addition to an entry file (packages/client-runtime/package.json; packages/provider-core/package.json).
- Broad contracts and forward-compatibility helpers expose significant protocol machinery. ForwardCompatibleOptional performs generic assertions and silently treats unrecognized optional values as absent (packages/contracts/src/baseSchemas.ts:47). Useful compatibility behavior, but not obvious from ordinary optional typing alone.
- Some names promise more than validation provides: IsoDateTime is simply Schema.String (packages/contracts/src/baseSchemas.ts:44). Malformed timestamps can satisfy this API.

Worth copying into robkit:
- Publish explicit subpaths for distinct capabilities and accompany them with a short responsibility/dependency table.
- Keep provider-specific objects behind normalized schemas; keep compatibility behavior documented beside its API.

## 3. Type safety at the edges - 8/10

What they do well:
- tsconfig.base.json enables strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, and erasableSyntaxOnly. tsconfig.effect.json additionally rejects unsafe Effect assertions and unknown/any failure channels.
- Files are decoded before entering the domain: apps/server/src/project/T3ProjectFileLoader.ts:12 compiles the decoder; :59 reads the file and :81 decodes it, mapping read and schema failures explicitly.
- CLI/environment parsing uses Effect Config and typed flags rather than scattering unvalidated process.env reads: apps/server/src/cli/config.ts:31 and :95. Branded identifiers distinguish concepts such as provider kinds and instances (packages/contracts/src/providerInstance.ts:17).
- No @ts-ignore or @ts-expect-error occurred in the filtered production source. The 40 approximate any type positions are small relative to source size, and examples in packages/client-runtime/src/rpc/client.ts:112 are generic extraction machinery rather than arbitrary application values.

Weaknesses:
- Desktop preload sometimes checks only an object's existence or an array's shape before asserting a rich bridge result. See apps/desktop/src/preload.ts:72, :81 and :114. Those checks are weaker than decoding the complete payload.
- IsoDateTime is not date validation (packages/contracts/src/baseSchemas.ts:44). Forward-compatible helpers need double assertions at :132 and :173. These deserve focused tests and cannot support an invalid-states-never-compile claim.
- Platform/build configuration does not universally use the server's parsing discipline. For example apps/web/vite.config.ts:31 converts PORT with Number and reads string environment values directly. This is a lower-risk build edge, but still an exception.

Worth copying into robkit:
- Enable exactOptionalPropertyTypes and noUncheckedIndexedAccess, then parse files, environment, and transport inputs once at their boundaries.
- Give identifiers nominal brands when mixing two IDs would be a realistic error; audit IPC assertions separately from server schemas.

## 4. Naming and domain language - 8/10

What they do well:
- docs/internals/glossary.md:7 distinguishes environment, client, project, thread and turn, then separates commands, events, receipts, projections and outbox effects. The names appear in contracts and implementation paths such as EventSink, CommandReceiptStore and EffectWorker.
- Provider versus driver versus instance is explicitly distinguished, reflected in ProviderDriverKind and ProviderInstanceId (packages/contracts/src/providerInstance.ts:17). This prevents a useful multi-provider distinction becoming an ambiguous string.
- WorkspacePaths and T3ProjectFileLoader identify concrete ownership. Error names state the failing operation, including WorkspacePathOutsideRootError (apps/server/src/workspace/WorkspacePaths.ts:62).

Weaknesses:
- Turn, run, run attempt, provider turn, provider session, and provider thread are all real distinctions but difficult for a newcomer. Their simultaneous imports in packages/provider-core/src/server/ProviderAdapter.ts:1 show the vocabulary burden.
- The V2 suffix persists across type and service names even inside orchestration-v2. EventSink.ts:70 uses EventSinkV2Shape, while its filename omits V2. Legacy support has a legitimate purpose, but naming reflects migration history as well as domain intent.

Worth copying into robkit:
- Keep a small glossary focused on distinctions that affect behavior, and use those terms in error tags and module names.
- Distinguish configuration identity from implementation kind before supporting multiple instances of an integration.

## 5. Simplicity - 5/10

What they do well:
- Small services are direct. T3ProjectFileLoader has one operation with a straightforward read/decode/log/none flow (apps/server/src/project/T3ProjectFileLoader.ts:28).
- A normal transport operation can be thin: projectsCreateNew delegates to one domain operation and maps its error (apps/server/src/ws.ts:2862).
- Effect removes bespoke resource, cancellation, dependency injection and typed-error frameworks. EventSink's transaction/publication protection uses existing primitives rather than a separate custom execution engine (apps/server/src/orchestration-v2/EventSink.ts:257).

Weaknesses:
- The central orchestrator is 14,556 lines; ClaudeAdapterV2 is 12,335, and ProjectionStore is 7,476. These are handwritten core code, not generated protocol files. Splitting packages has not made individual decisions uniformly local.
- Tracing an agent action involves client command/state, RPC contract and handler, orchestrator decision, persistence/outbox, effect worker and provider adapter. These layers serve durability and multi-client requirements, but the reader still pays for them (docs/internals/overview.md:48; EventSink.ts:80).
- Effect newcomers must understand lazy effects, environment requirements, layers, scopes, fibers, interruption, typed errors and defects before changing concurrency safely. The detailed rules at docs/internals/effect-services.md:95 and :113 are evidence of that learning cost.
- Dependencies are substantial: web has 73 external runtime declarations and mobile 84. Many support actual features, so the raw counts do not prove waste, but this is not a small-dependency system (apps/web/package.json; apps/mobile/package.json).

Worth copying into robkit:
- Copy the thin-handler pattern and explicit transaction boundaries, sized to robkit's requirements.
- Keep command decisions decomposed by domain and monitor large coordination files; do not adopt an entire event/outbox architecture merely to obtain typed errors.

## 6. Consistency - 7/10

What they do well:
- WorkspacePaths and T3ProjectFileLoader repeat the same imports, tagged errors, inline Context.Service, construction, layer and named Effect.fn pattern (apps/server/src/workspace/WorkspacePaths.ts:1; apps/server/src/project/T3ProjectFileLoader.ts:1).
- Named Effect functions provide uniform tracing and logging context. The conventions are reinforced by prefer-effect-fn, prefer-catch-tags, suppression-reason lint rules and Effect diagnostics (oxlint-plugin-t3code/index.ts:68; tsconfig.effect.json).
- Web and mobile share client-runtime connection/domain logic instead of reimplementing everything per surface (packages/client-runtime/README.md). Web UI import rules and shadcn lint configuration reinforce common component usage (vite.config.ts).

Weaknesses:
- The documented rule says no standalone FooShape interface, but EventSinkV2Shape remains at apps/server/src/orchestration-v2/EventSink.ts:70, with its tag at :199. The codebase is not fully migrated to its own current service style.
- Desktop preload mixes native Promise/error/cast patterns with the service-based model (apps/desktop/src/preload.ts:35 and :59). Some platform differences are necessary; error/validation quality differs as well.
- There are 663 oxlint-disable occurrences and separate per-app Effect diagnostic exceptions (apps/web/tsconfig.json). Reasons improve accountability, but contributors must still learn where a general rule stops applying.

Worth copying into robkit:
- Define one small service/module convention and enforce the mechanical parts.
- Require reasons for suppressions and review patterns of repeated exceptions before adding more rules.

## 7. Error handling - 8/10

What they do well:
- Workspace errors carry paths, stage and causes, and operation signatures advertise their failure unions (apps/server/src/workspace/WorkspacePaths.ts:11, :36 and :83).
- Optional project configuration has explicit recovery semantics. A missing file returns none; unreadable/invalid content logs a structured warning and returns none (apps/server/src/project/T3ProjectFileLoader.ts:33 and :59). This is deliberate degradation, not an unmarked swallowed exception.
- Transaction code protects publication after commit, including on cancellation (apps/server/src/orchestration-v2/EventSink.ts:271). This handles a meaningful failure mode beyond adding try/catch.
- The actual error classes retain immediate causes, while docs/internals/effect-services.md:128 defines bounded diagnostic attributes and safe messages. Effect's typed channel makes known recovery paths inspectable.

Weaknesses:
- apps/desktop/src/preload.ts:42 has an empty catch around legacy-storage migration. Continuing may be reasonable, but the path loses diagnostics when the migration fails.
- WorkspaceRootCreateFailedError says only that creation failed, without suggesting a permission/path remedy (apps/server/src/workspace/WorkspacePaths.ts:23). EventSinkWriteError similarly reports event count but offers no recovery action (:37).
- The production scan found 366 Effect.ignore references and 33 exactly matched empty Promise catches. Many can be legitimate cleanup/best-effort behavior; they still prevent claiming that all failures are observable. A lexical scan is not a classification of these sites.

Worth copying into robkit:
- Use structured domain errors with stable tags, immediate causes, and bounded context.
- Make optional-feature recovery explicit in its return type, and log degraded behavior without exposing credentials or raw payloads.

## 8. Testing - 8/10

What they do well:
- WorkspacePaths tests call the service through a layer and assert directory creation and path-escape rejection (apps/server/src/workspace/WorkspacePaths.test.ts:24 and :46). They exercise externally meaningful behavior.
- Race-sensitive WebSocket tests coordinate with Deferred and Queue rather than arbitrary delays (apps/server/src/ws.test.ts:147 and :211). Effect's test clock and service substitution are substantial gains for deterministic concurrency tests.
- Browser render infrastructure owns cleanup through AsyncDisposable and creates a real router; it deliberately disables catch boundaries that could hide failures (apps/web/test/render.tsx:39 and :58). This is enforced by a lint rule, not just an example.
- CI runs Chromium browser tests and separately builds/boots the production chunk graph (.github/workflows/ci.yml:340; apps/web/scripts/verify-built-boot.ts:1). The latter catches failures source-module tests cannot.
- A packaged desktop smoke path launches Electron against an older database, then checks a thread's messages render (scripts/smoke-desktop-app.ts:1 and :60). This provides an end-to-end startup/migration/render path. Integration tests also span orchestration and provider switching (apps/server/src/orchestration-v2/testkit/ProviderSwitch.integration.test.ts:440).

Weaknesses:
- Test speed was not measured. Server config disables file parallelism and allows 120-second tests; CI shards the suite and describes multi-minute shard duration (apps/server/vite.config.ts:136; .github/workflows/ci.yml:348). Focused execution is supported, but the full suite is not a tiny fast loop.
- Windows testing is manual-only and its workflow explicitly documents an unfinished Windows suite (.github/workflows/windows-tests.yml:1). That is a significant gap for a cross-platform desktop/server product, although the comment is not a measured current failure rate.
- Built-web boot validation deliberately runs without a real backend (apps/web/scripts/verify-built-boot.ts:11 and :29). It is useful boot coverage, not a complete user-to-provider journey. Packaged smoke coverage also does not establish every provider and remote mode.
- No tests were run in this research. File counts are not code coverage or proof that configured gates currently pass.

Worth copying into robkit:
- Test concurrency with explicit completion signals and drainable workers; forbid timing guesses mechanically.
- Add one packaged/built artifact journey alongside source tests, especially across database migration and frontend boot.

## 9. Keeping standards up - 9/10

What they do well:
- oxlint-plugin-t3code/index.ts:40 registers specific rules for permission bypasses, raw MCP registration, polling, wall-clock waits, unreasoned skips, render cleanup and suppression reasons. vite.config.ts enables them and owns targeted boundary restrictions.
- tsconfig.effect.json turns service dependency mistakes, unsafe error channels, nested runtimes, global I/O misuse and many inconsistent Effect constructions into checker diagnostics. Package typecheck scripts invoke effect-tsgo, so this is more than an editor suggestion (packages/contracts/package.json; package.json).
- CI checks unused files/dependencies/exports, generated GitHub and Expo operations, lint/format, typecheck, build, preload output, unit/integration/browser tests and native analysis (.github/workflows/ci.yml:103, :106, :112 and :191). Its final CI result checks selected job results rather than assuming a skipped job succeeded.
- vite.config.ts configures staged formatting, linting and knip, plus no test retries and no focused tests in CI. package.json exposes check:changed, backed by scripts/check-changed.ts and its tests.
- Agent and review instructions align: AGENTS.md, CLAUDE.md, docs/internals/effect-services.md, .coderabbit.config.ts:22 and .github/pull_request_template.md point at behavioral evidence and house rules. They distinguish mechanical checks from review judgment.

Weaknesses:
- Universal architecture limits and maximum module complexity are not enforced; giant central files remain. Some typed lint rules, including no-floating-promises and no-unsafe-type-assertion, are explicitly off in vite.config.ts.
- Review bots do not constitute unconditional merge enforcement: .coderabbit.config.ts sets request_changes_workflow false and treats maintainer-associated authors differently. External branch-protection settings cannot be verified from the clone.
- Windows remains on demand (.github/workflows/windows-tests.yml:1), and style migration gaps such as EventSinkV2Shape show that written standards are not all mechanically enforced.

Worth copying into robkit:
- Turn recurring production bugs and flaky-test patterns into narrow custom lint rules, with examples and suppression reasons.
- Gate unused exports/dependencies and checked-in generated artifacts, alongside typecheck and behavior tests.

## 10. Nice to work in as a human - 7/10

What they do well:
- docs/operations/development.md:3 gives a short install/run path, explains pairing, isolated worktree state, ports, profiling and the free replay provider. The replay path exercises real pipeline/UI behavior without paid model calls (:80).
- AGENTS.md contains a useful glossary, source map, focused verification commands and explicit live-data safety constraints. CLAUDE.md forwards to it rather than maintaining an independent instruction set.
- docs/internals/overview.md explains ownership and why command acknowledgement differs from settled side effects. docs/internals/glossary.md makes specialized vocabulary searchable.
- Local comments explain real constraints: EventSink.ts:271 explains why post-commit publication must survive cancellation; baseSchemas.ts:7 explains string allocation behavior on Hermes. These help readers understand why code is shaped this way.
- packages/client-runtime/README.md supplies a navigable API map, and apps/mobile/README.md explains native variants and setup instead of pretending Expo Go is sufficient.

Weaknesses:
- Only one of 30 packages has a top-level README. Central documentation helps, but provider/transport package users must often infer usage and boundaries from source and tests.
- The setup command is short, but the conceptual onboarding is substantial: Effect, event/outbox lifecycle, multi-environment permissions and separate native clients. A new contributor cannot safely change every area after a quick README read (docs/internals/effect-services.md; docs/internals/overview.md).
- Large central files and overlapping V2 lifecycle types make navigation expensive. The root README primarily serves users; contributors must follow the development and architecture documentation chain.
- CONTRIBUTING.md imposes prior approval and detailed evidence for many outside changes. This is understandable review-capacity management, but it adds friction to a new contributor's first accepted change. No actual setup duration was measured.

Worth copying into robkit:
- Keep setup/run instructions short, then document only the cross-cutting constraints a reader could get wrong.
- Provide an offline/replay path for the real application flow and isolate worktree ports/state by default.

## Top 5 practices to copy

1. Convert concrete failure patterns into custom lint rules: permission bypass, polling waits, unreasoned skips and unsafe test lifetimes. Evidence: oxlint-plugin-t3code/index.ts:40; vite.config.ts.
2. Commit durable state and side-effect intent together, then publish only after commit, with explicit interruption semantics. Apply this only where robkit needs durable asynchronous workflows. Evidence: apps/server/src/orchestration-v2/EventSink.ts:257 and :271.
3. Parse edge values with shared schemas and expose typed failures/dependencies at a small service boundary. Evidence: apps/server/src/project/T3ProjectFileLoader.ts:12; apps/server/src/workspace/WorkspacePaths.ts:83.
4. Use explicit concurrency milestones and owned cleanup in tests instead of sleeps, retries and global teardown assumptions. Evidence: apps/server/src/ws.test.ts:147; apps/web/test/render.tsx:39.
5. Verify the artifact users run, including old-data migration and built frontend boot, in addition to testing source modules. Evidence: scripts/smoke-desktop-app.ts:1; apps/web/scripts/verify-built-boot.ts:1; .github/workflows/ci.yml:344.
