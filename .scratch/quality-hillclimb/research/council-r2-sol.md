# robkit quality report

Commit: f2a16c1a62b213041ad740726d191967559f922c. Scope: all eight published package manifests and entry points; guard, session, adapters, core HTTP/session/schema/roles, dev execution and error helpers, create-robkit generation/add/install checking/Coolify HTTP, representative generated hub/admin/core-client code, ESLint rules, repository checks, CI, hooks, contributor docs, and end-to-end harnesses. Tests were sampled across those areas. Docker-backed suites and production journeys were inspected but not executed. Only rubric.md was read under .scratch/quality-hillclimb; no earlier reports or scores were read. This is an independent absolute assessment, not a comparison with the other council members.

## Scores

| # | Category | Score | One-line reason |
| --- | --- | --- | --- |
| 1 | Module boundaries | 8/10 | A tested dependency graph enforces direction; session has several distinct responsibilities behind its public surface. |
| 2 | Public API design | 8/10 | Small adapters and tagged results are clear; some public contracts still permit ambiguous or invalid combinations. |
| 3 | Type safety at the edges | 9/10 | Strict types, brands, readers, and zero runtime casts; some readers validate syntax too loosely. |
| 4 | Naming and domain language | 8/10 | Domain names are unusually disciplined and checked; Profile is still exposed under viewer names. |
| 5 | Simplicity | 8/10 | Little dependency weight and thin adapters; the request guard concentrates substantial protocol complexity. |
| 6 | Consistency | 8/10 | Shared conventions cover most code; reader failures and browser/server representations still differ. |
| 7 | Error handling | 8/10 | Faults preserve causes and have useful boundary reporting; some HTTP paths discard diagnostic information. |
| 8 | Testing | 8/10 | Strong public behavior, conformance, type, package, and journey tests; useful gaps remain in focused coverage. |
| 9 | Keeping standards up | 9/10 | An excellent executable standards system; a few checks cover narrower cases than their written rules. |
| 10 | Nice to work in as a human | 8/10 | Clear contributor guidance and a fast gate; template work and the full dev loop require more setup and navigation. |

## Measurements

- Confirmed HEAD with `git rev-parse HEAD`; `git status --short` was empty before and after checks.
- Ran the brief's Git Bash PATH export, then `pnpm install --frozen-lockfile && pnpm check`. Both passed. Install used pnpm 11.28.9. The check passed 44 tasks, with 43 cache hits and one fresh task. Formatting and knip also passed.
- To verify this checkout rather than rely on shared cache logs, ran the same PATH export and `pnpm turbo run lint typecheck test:unit --force`. Passed 44/44 tasks, zero cache hits, 52.428 seconds. Fresh log: `C:/Users/rober/AppData/Local/Temp/council-r2-sol-check.log`.
- Fresh Vitest summaries total 887 passed tests and one skipped test across 77 test files, including reported type-test files. The skip is the non-Windows spawn-failure case in `packages/dev/src/exec.test.ts:34`. This is not the full Docker-backed test count.
- Measured tracked files using `git ls-files packages tooling`; parsed published runtime TypeScript with the TypeScript compiler AST. Scope: `packages/*/src/**`, excluding `*.test.*`, `*.test-d.*`, and `src/test/**`. Counts below exclude generated templates, private tooling, configuration, and comments when measuring syntax nodes.

| Measurement | Result |
| --- | --- |
| Workspace packages, excluding root | 14: eight published and six private |
| Published runtime source files | 80 |
| Published runtime source lines | 7,359, splitting file text on newline |
| Explicit any type nodes | 0 |
| Type assertions, excluding as const | 0 |
| Non-null assertions | 0 |
| as const assertions | 12 |
| @ts-ignore or @ts-nocheck occurrences in runtime text | 0 |
| eslint-disable occurrences in runtime text | 1 |
| Tracked ordinary test files across packages and tooling | 103 |
| Of those, Docker-named *.db.test.ts files | 18 |
| Additional *.test-d.ts files | 6 |
| Distinct external dependencies in published dependencies fields | 7: drizzle-orm, hono, jose, postgres, @clack/prompts, prettier, yaml |
| Largest published runtime file | packages/session/src/request-guard.ts, 420 lines |
| Next largest | packages/create-robkit/src/coolify-deploy.ts, 370 lines |
| Next largest | packages/core/src/sessions.ts, 317 lines |
| Next largest | packages/create-robkit/src/check.ts, 291 lines |
| Next largest | packages/core/src/apps.ts, 238 lines |

The dependency count excludes peers and development dependencies. The AST scan script is outside the repository at `C:/Users/rober/AppData/Local/Temp/council-r2-sol-measure.mjs`.

Executed a direct Node source probe importing `readDomain`, `readHost`, and `readAccessRule`. Results: a 64-character domain label was returned unchanged, `readHost({HOST:"..."})` returned `"..."`, and a roles rule with an empty role list was accepted. The last is a documented semantic choice, not evidence of an access bypass. The first two demonstrate incomplete boundary validation.

## 1. Module boundaries: 8/10

What they do well:
- `tooling/eslint/package-graph.js` explicitly records runtime and development edges. `tooling/repo-checks/src/graph-check.ts:158` checks runtime imports separately; relative imports cannot escape the owning package. Its tests exercise forbidden, undeclared, and stale edges and cycles.
- `tooling/eslint/layers.js` derives core exclusions from the graph and forbids guard I/O and framework imports. These are active rules in `tooling/eslint/index.js`, with negative tests in `layers.test.js`.
- Hono and Start adapters are small translations of `requestGuard`, without importing core: `packages/hono/src/guarded.ts` and `packages/start/src/guarded.ts`.
- Generated installs get their own AST-based layer checker, including shared packages and require/import forms: `packages/create-robkit/src/check.ts`.

Weaknesses:
- Session's six public entry paths cover tokens, request orchestration, install addresses, manifests, generic input parsing, and reporting. Understanding `packages/session/src/index.ts` alone does not explain the full package. `packages/dev/src/run-command.ts:1` even gets general reporting through session.
- Browser-safe and Node-only capabilities coexist in this package. Deliberate subpath imports keep current browser code safe, but the package boundary itself does not make those capabilities obvious.

Worth copying into robkit:
- Preserve the graph as the single source for allowed edges and derived lint rows when adding packages.

To raise this by one point:
- In `packages/session/package.json` and `packages/session/src/index.ts`, make the server-only request guard entry explicit and document the browser-safe surface in `packages/session/README.md`. Add a browser-bundling check in `tooling/repo-checks/src/published.test.ts` that fails if browser entry points pull in Node built-ins. Move general reporting to an explicit small shared entry rather than routing command reporting through the token entry.

## 2. Public API design: 8/10

What they do well:
- `packages/guard/src/guard.ts:49` uses discriminated access, viewer, session, and decision unions. A caller can exhaust outcomes without interpreting strings or nullable fields.
- Slug, CodeId, and RoleId brands distinguish values that otherwise look identical. `packages/session/src/request-guard.test-d.ts` proves arbitrary strings cannot supply an app slug and role names cannot substitute for ids.
- Adapter setup is compact and documented beside its signature. Start puts the viewer into registered request context; Hono exposes `c.var.viewer`.
- Packed exports are checked for actual JS, publint correctness, and Are the Types Wrong compatibility in `tooling/repo-checks/src/published.test.ts`.

Weaknesses:
- `AccessRule` permits `{kind:"roles", roles:[]}` and `readAccessRule` accepts it (`packages/guard/src/guard.ts:162`). It silently behaves like owner-only despite having a distinct kind. This is documented in CONTRIBUTING but remains surprising API behavior.
- `GuardedOptions.core` is a plain string. Bad values are discovered by `installOf` inside `requestGuard`, while the app slug already has a validated type (`packages/session/src/request-guard.ts:25`).

Worth copying into robkit:
- Keep negative type tests beside every adapter's public entry, especially when adding configuration options.

To raise this by one point:
- In `packages/guard/src/guard.ts`, represent a roles rule with a nonempty role list and reject empty lists in its reader; update the relevant guard, manifest, and adapter type tests.
- In `packages/session/src/request-guard.ts` and `packages/session/src/app-env.ts`, accept a validated core-origin value or parsed install object so standard callers cannot pass an arbitrary URL string. Update `request-guard.test-d.ts` and the API report.

## 3. Type safety at the edges: 9/10

What they do well:
- `tooling/typescript/base.json:7` enables strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, and noImplicitOverride. The runtime AST measurements found no any, non-null assertions, or narrowing casts.
- `tooling/eslint/index.js` enables strict typed rules, forbids unsafe assertions outside tests, and adds a JSON-specific cast rule. Negative fixtures test those safeguards.
- External JSON begins as unknown and goes through readers: `packages/session/src/input.ts`, `packages/session/src/session-token.ts`, and the generated core-client's `call-core.ts`.
- Core's database schema adds singleton, code shape, foreign-key, and access-kind constraints: `packages/core/src/schema.ts`.

Weaknesses:
- `readDomain` only checks a label regex; it accepts labels longer than DNS permits. `readHost` accepts arbitrary strings made from word characters, dots, colons, and hyphens, including `...` (`packages/session/src/input.ts:64` onward). The direct probe confirmed both.
- The type for a parsed string is often still string, so validity can be lost when values are reconstructed downstream. Brands are strongest for identifiers, less complete for addresses.

Worth copying into robkit:
- Retain the combination of unknown-first parsing and type-level misuse tests; neither alone supplies the same protection.

To raise this by one point:
- Tighten `readDomain` and `readHost` in `packages/session/src/input.ts` using domain label/total-length checks and explicit hostname or IP parsing, including supported IPv6 forms. Add malformed punctuation, oversized label/domain, and valid IPv4/IPv6 cases to `packages/session/src/input.test.ts` and carry validated address types into the public configuration APIs.

## 4. Naming and domain language: 8/10

What they do well:
- `GLOSSARY.md` distinguishes install, app, access code, viewer, and profile. Names like `mintAppToken`, `readSessionToken`, `setRoleCodes`, and `registerApps` match behavior.
- `tooling/repo-checks/src/glossary.ts` scans real code and docs with explained exceptions. Its repository test passed freshly.
- Package names expose actual concerns: guard, session, core, dev, and stack adapters. Routes and test names largely follow the same vocabulary.

Weaknesses:
- `packages/core/src/sessions.ts:52` declares `viewer: Profile`, repeated in `SignedIn`, `Holder`, and generated hub `core-api.ts`. The glossary explicitly says profile is distinct from the access-deciding Viewer. A reader sees the same field name for both concepts.
- Generic names such as `text`, `field`, and `get` are exported from internal Coolify helper modules (`packages/create-robkit/src/coolify-api.ts`). Their meaning depends on remembering the module context.

Worth copying into robkit:
- Continue recording ambiguous terms and their resolutions in the glossary, then enforce the resolved names.

To raise this by one point:
- Rename Profile-valued `viewer` properties to `profile` across `packages/core/src/sessions.ts`, session routes, generated hub `src/core-api.ts`, and consumers/tests. Keep `viewer` for `SignedInViewer` and `Viewer`; record the intended HTTP contract change.
- Give Coolify helpers intent-bearing names in `packages/create-robkit/src/coolify-api.ts` and update `coolify-config.ts` and `coolify-deploy.ts` imports.

## 5. Simplicity: 8/10

What they do well:
- The guard is a direct outcome table with a small classifier, not an extensible policy engine (`packages/guard/src/guard.ts:103`).
- Both adapters contain almost no independent policy. Core routes call plain functions rather than service-container or repository abstractions.
- Seven external runtime dependencies across eight published packages is restrained. The generator edits an in-memory map of files, with disk writing separately testable (`packages/create-robkit/src/generate.ts` and `write.ts`). Knip passes.

Weaknesses:
- `packages/session/src/request-guard.ts` is 420 lines and houses navigation classification, forwarded URL handling, state cookies, callback validation, signed-out caching, token verification, redirects, and error reporting. Its closure keeps state local, but tracing one callback needs substantial context.
- `packages/core/src/roles.ts:56` maps each role by filtering the entire membership list. This is simple locally but repeats traversal for every role.

Worth copying into robkit:
- Keep guard decisions pure and adapters thin when supporting another stack.

To raise this by one point:
- Extract the cohesive refresh/callback protocol from `packages/session/src/request-guard.ts` into one private module with its state and cookie rules together. Leave the top-level function as session read, rule read, decision, response; keep existing public behavior tests.
- In `packages/core/src/roles.ts:listRoles`, index membership rows once by role id before mapping roles. Preserve ordering and add an observable multi-role case to `roles.db.test.ts`.

## 6. Consistency: 8/10

What they do well:
- Shared ESLint/TypeScript settings and formatting are active across workspace packages. Lint suppressions require reasons and cannot be unused.
- Common config readers return InputProblem, and command boundaries translate fixable failures to CommandProblem (`packages/session/src/input.ts`, `packages/dev/src/run-command.ts`).
- Shared browser request behavior lives in generated `packages/core-client/src/call-core.ts`, avoiding separate timeout/error implementations in each admin feature.

Weaknesses:
- Reader failure is not universally InputProblem: guard readers return undefined, session environment readers return InputProblem, and browser readers return undefined inside a Result envelope. Some differences are appropriate, but naming alone does not tell a caller which contract applies.
- The generated core-client duplicates `isRecord` because importing session's input entry adds a browser dependency. `packages/create-robkit/src/core-client.test.ts` checks equivalence, so drift is mitigated rather than structurally removed.

Worth copying into robkit:
- Keep compatibility tests when an owned generated install intentionally duplicates a tiny primitive.

To raise this by one point:
- In `docs/conventions/input.md`, explicitly distinguish optional recognition from actionable validation and assign clear naming/signature conventions. Apply them to `packages/guard/src/guard.ts`, `packages/session/src/input.ts`, and generated `call-core.ts`, with type tests for each public contract. Avoid requiring every recognizer to manufacture a CLI-oriented message.

## 7. Error handling: 8/10

What they do well:
- `packages/dev/src/run-command.ts` distinguishes fixable problems from faults, reports a bug URL, and returns an explicit exit code.
- Spawn failures retain their original cause and name the command, directory, and fix (`packages/dev/src/exec.ts`). Multiple cleanup failures survive as AggregateError (`packages/dev/src/failures.ts`).
- Core assigns unexpected faults request ids, keeps details in logs, and returns a correlatable message (`packages/core/src/app.ts:81`). Guard faults distinguish network, key, and access-rule failures instead of converting outages into signed-out states.
- Coolify requests have deadlines and actionable status-specific guidance (`packages/create-robkit/src/coolify-api.ts`).

Weaknesses:
- `packages/session/src/core-access.ts:43` turns any JSON-body rejection into undefined, then throws a generic malformed-rule error without the original cause. A truncated response and malformed JSON become indistinguishable.
- Generated `packages/core-client/src/call-core.ts:63` likewise discards response-body errors. A body timeout after headers arrives is no longer reported as the timeout handled around fetch. Browser faults have no reporting hook retaining the original error.

Worth copying into robkit:
- Preserve the rule that inability to verify identity is an unavailable response, with its cause reported, rather than a login redirect.

To raise this by one point:
- Preserve JSON/body failures as causes in `packages/session/src/core-access.ts` and cover invalid JSON versus interrupted body reads in `core-access.test.ts`.
- In generated `packages/core-client/src/call-core.ts`, handle fetch and body consumption under the same timeout/error classification and provide an optional diagnostic callback. Add a response whose headers arrive but body times out to its colocated tests.

## 8. Testing: 8/10

What they do well:
- Fresh lint/type/unit execution passes. Type suites protect six public surfaces; adapter tests run shared conformance cases through actual request handling (`packages/hono/src/guarded.test.ts:24`, Start's equivalent, and `packages/guard/conformance.json`).
- Repository checks test the checks themselves and run them against real packages. Packed artifact validation and compilation of documentation examples protect behavior ordinary unit tests miss.
- `tooling/e2e/src/install.ts` generates installs and adds the opposite stack. `install-journeys.ts` exercises owner, guest, role, app, theme, and accessibility journeys. Production tests inspect built images and run HTTPS journeys. These were read, not run here.
- The repository has 18 database-named test files across core and dev, and core's full coverage floor is high (`packages/core/vitest.config.ts`).

Weaknesses:
- Generator coverage floors are 73% statements and 66% branches (`packages/create-robkit/vitest.config.ts:15`), leaving substantial room around commands that write installs or deploy them. Dev's full statement floor is 73%.
- Template lint and many generated tests depend on generating an install and running the larger Linux/Docker path; the root generator ESLint config ignores templates. The fast gate therefore gives weaker feedback on owned UI changes than on library changes.
- The confirmed permissive host/domain cases and loss of body-timeout classification survive the passing gate, showing useful regression-test opportunities.

Worth copying into robkit:
- Retain independent conformance data shared by pure guard and adapters, plus packed artifact tests.

To raise this by one point:
- Add the boundary and interrupted-response regressions named in categories 3 and 7.
- Add a no-Docker template test task using the generated hub/admin/core-client tests and lint configuration; wire it into `packages/create-robkit/package.json:test:unit` or a dedicated workspace task required by `pnpm check`. Cover remaining command refusal and rollback branches before raising the generator's floors.

## 9. Keeping standards up: 9/10

What they do well:
- Six custom ESLint rules have negative tests: layers, core schema, JSON casts, silent catches, one problem type, and relative extensions (`tooling/eslint/index.js`).
- Fresh repo checks cover the dependency graph, package scripts, catalogs, API reports, docs examples, glossary, published artifacts, and Renovate configuration. There is both structural enforcement and actual artifact validation.
- `.github/workflows/ci.yml` runs the full gate and combines it with PR-specific checks. Coverage cannot fall below the base's configured thresholds, commits are checked, changesets are required for the selected source changes, and PR tickets must exist.
- Hooks run staged lint/format and commit-subject checks; `.github/CODEOWNERS` names a reviewer. The existence of a required remote branch-protection setting was not verified by this local review.

Weaknesses:
- `tooling/repo-checks/src/problem-checks.ts:14` recognizes only a narrow text pattern: const bindings initialized by a directly named read function and exactly `typeof name !== "string"`. Aliases, await, spacing, and other equivalent checks evade that convention check.
- `.changeset/config.json` limits changedFilePatterns to src. Templates are published behavior, but template-only changes are outside that release-note requirement.
- `no-silent-catch.js` permits dropping an error when any suitably placed comment exists; it cannot establish that the comment explains the choice. This remains a review obligation.

Worth copying into robkit:
- Keep standards executable and test their negative paths, rather than adding more prose-only contributor rules.

To raise this by one point:
- Replace `typeofReadChecks` with an AST-based check that follows imported reader bindings, awaited calls, and declarations; extend `problem-checks.test.ts` with equivalent syntax forms.
- Include shipped template behavior in `.changeset/config.json:changedFilePatterns`, with template test exclusions, and add a fixture proving a template-only functional change requires a changeset. Document the unavoidable semantic review obligation for catch explanations.

## 10. Nice to work in as a human: 8/10

What they do well:
- CONTRIBUTING provides prerequisites, WSL instructions, fast/full gates, a linked-install command, a worked change, and a PR workflow. The fast gate actually works and a forced run took 52.4 seconds here.
- All eight published packages have READMEs. Core, session, dev, and generator explain contributor concerns, while architecture docs and ADRs explain decisions.
- Failure output is considered part of the developer experience: `docs/testing.md` connects symptoms to suite diagnostics, and `tooling/e2e/src/browser.ts` / production harnesses collect useful state.
- Most feature files and colocated tests are easy to locate. Input errors often name both the bad setting and the corrective action.

Weaknesses:
- Windows can run the fast gate, but the actual dev runner and full journey require WSL/Linux or macOS plus Docker. This is clearly documented, but still a practical onboarding cost.
- Hub/admin application code lives deep under `packages/create-robkit/templates/base/apps/`, and focused template validation is less discoverable than package testing. A contributor must understand both template ownership and generated-install behavior.
- The worked CONTRIBUTING change sketches a string-array role reader under a nocheck fence even though the real API uses branded RoleId values. It no longer shows a directly applicable implementation of the proposed change.

Worth copying into robkit:
- Keep a measured fast gate and a linked install that exercises local packages as a user would.

To raise this by one point:
- Update the worked example in `CONTRIBUTING.md` to modify the actual `readRoleIds` result while retaining its brands; make the complete example compile in the documentation-example check.
- Add a template-contributor walkthrough to `packages/create-robkit/README.md`, linking hub/admin/core-client source locations and the focused no-Docker validation command proposed in category 8. Show one template edit propagated into a linked install.

## Top 5 practices to copy

These are existing robkit practices worth retaining and applying to every new feature.

1. A declared package graph checked against manifests and source imports, with layer rules derived from the same data: `tooling/eslint/package-graph.js`, `tooling/repo-checks/src/graph-check.ts`.
2. A pure access decision shared by thin adapters and exercised through common conformance cases: `packages/guard/src/guard.ts`, `packages/guard/conformance.json`, `packages/hono/src/guarded.test.ts`.
3. Unknown-first boundary readers combined with branded identifiers and negative type tests: `packages/session/src/input.ts`, `packages/guard/src/guard.ts`, `packages/session/src/request-guard.test-d.ts`.
4. Validation of shipped packages and compiled documentation examples: `tooling/repo-checks/src/published.test.ts`, `tooling/repo-checks/src/doc-examples.test.ts`.
5. Distinct expected command failures and unexpected faults, preserving original and aggregate causes: `packages/dev/src/run-command.ts`, `packages/dev/src/exec.ts`, `packages/dev/src/failures.ts`.

