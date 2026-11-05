# 04: Gates that catch drift

**What to build:** Checks that fail the build when the code drifts from its written rules: the package graph, unused code, the published packages and their public API. Plus a fast gate a contributor can run in under a minute.

Raises rubric categories 9 (keeping standards up), 1 (module boundaries), 2 (public API) and 8 (testing). See `../research/robkit-round-0.md` sections 1 and 9, `../research/t3code.md` section 9 (knip, custom rules, generated-code checks, scored 9) and `../research/tanstack-router.md` section 9 (publint, attw, compiler matrix).

- `pnpm check`: format check, lint, typecheck and every test that needs no Docker, with nothing else to start. `pnpm check:all`: what CI runs. Split the turbo tasks so the fast tests can run alone (for example a `test:unit` task next to `test`), and say in the root `package.json` which is which. Ticket 01 documents both by these names.
- One declared package graph: which workspace package may depend on which, in one file in `tooling/repo-checks`. A repo check fails on a `package.json` dependency or an import that isn't in it, and on a cycle. The `layer` ESLint rule and this graph must agree; if one can be derived from the other, do that.
- `robkit check` in an install checks the install's shared packages, not only its apps, so a shared package can't hide a forbidden import (`packages/create-robkit/src/check.ts`).
- knip across the workspace for unused files, exports and dependencies, run as part of the gate.
- publint and `@arethetypeswrong/cli` on each packed package, next to the existing packed-package check in `tooling/repo-checks`.
- A checked-in public API report for each published package (its exported names and their types, generated from the built declarations), and a check that fails when the API changes without the report changing with it. API changes then show up in review as a diff.

Add new dev dependencies through the catalog (see `AGENTS.md`'s conventions). List anything `AGENTS.md` or CONTRIBUTING should say under this ticket's `## Comments` instead of editing them.

**Blocked by:** none

**Status:** done

- [x] `pnpm check` runs without Docker, and `pnpm check:all` runs what CI runs
- [x] A repo check enforces the declared package graph and rejects cycles
- [x] `robkit check` covers an install's shared packages
- [x] knip, publint and attw run in the gate and pass
- [x] Each published package has an API report, and a check fails on an unreported API change
- [ ] The gate passes: `pnpm turbo run lint typecheck test`

## Comments

### What's there

- **Gates.** `pnpm check` runs Prettier, knip, then `turbo run lint typecheck test:unit`. `pnpm check:all` runs the same with `test` in place of `test:unit`, and CI now runs `pnpm check:all`. `test:unit` exists only in packages whose whole suite needs no Docker: guard, session, hono, react, start, create-robkit, eslint-config, repo-checks and test-session. Core and dev start Postgres in a global setup, so they have only `test`. The root `package.json` says which is which in its `"//"` field.
- **Package graph.** `tooling/repo-checks/src/package-graph.ts` lists each workspace package's allowed `dependencies` and `devDependencies` between workspace packages. Any package may take the shared ESLint and TypeScript configs. `graph-check.test.ts` fails on a manifest edge or an import the graph doesn't allow, on a relative import that leaves its package, on a graph edge no manifest has, and on a cycle.
- **Graph and layer rule.** The ESLint rule is a deny list and the graph an allow list, so neither can be derived from the other. Generating the ESLint row from the graph would also make eslint-config depend on repo-checks, which already depends on it, and turbo rejects that cycle. Instead, a test reads the rule's rows (eslint-config now exports them as `./layers`) and fails if the graph allows an edge a row forbids. Today that means the three adapter-to-core edges.
- **`robkit check`.** It now reads `packages/*` in an install as well as `apps/*`. A shared package may not import an app (by name or path), reach core, or read the session token. Two rule messages changed to say "app or shared package", and a new row covers a shared package's imports. The install's `AGENTS.md` states all four, and the three strings in `tooling/e2e/src/install-checks.test.ts` that quote the old core message are updated.
- **knip.** `knip.jsonc` at the root. It skips create-robkit's templates (an install's own files) and the dev runner's fixture installs. It sets `ignoreExportsUsedInFile`, which hides types exported only for their own file. It also leaves the catalog to a new repo check, because many catalog entries are versions only the templates take, and knip can't see the templates' manifests. That check (`catalog.test.ts`) fails on any entry no manifest takes, templates included.
- **publint and attw.** Both run on the tarball the packed-package check already makes. I used `@arethetypeswrong/core`, the engine behind `@arethetypeswrong/cli`, so the test gets problems as data rather than parsing CLI output. It skips `require` and `node10` resolution, as the CLI's `esm-only` profile does. publint skips one message: it says the templates' nested `package.json` files shouldn't have `exports`, but those become an install's own packages.
- **API reports.** Each published package has `api-report.md`: every export of each typed entry point with its type, printed from the built `.d.ts` files without comments, and formatted with Prettier. `api-report.test.ts` compares it with `toMatchFileSnapshot`, so a change fails with a diff. In CI a missing report fails too. `pnpm --filter @internal/repo-checks api:update` builds the packages and rewrites the reports. `files` in each manifest keeps the report out of the tarball.

### Changes outside the four checks

- The repo checks didn't run on Windows (`URL.pathname`, and `execFile` can't run `pnpm.cmd`). Fixed, so `pnpm check` runs there.
- create-robkit's tests timed out at 5 seconds on Windows with lint running beside them. `vitest.config.ts` now gives each test 30 seconds.
- turbo now hashes the whole repo's source for repo-checks' `test` and `test:unit`, since those read every package. Before, an import added to `tooling/e2e` passed from cache.

### Proof that each check fails

Each break was made in the working tree, run, then reverted.

- Graph: `@robkit/core` added to start's `dependencies`, `import "@robkit/core"` in hono, `import "../../core/src/index.ts"` in react, and a `guard -> hono` edge in the graph. All three workspace tests failed, naming each problem. The unit tests also cover each kind of problem.
- Layer agreement: `@robkit/core` added to react's dev edges in the graph. The test failed with "lets @robkit/react depend on @robkit/core, which the layer ESLint rule forbids".
- `robkit check`: with the tests written and check.ts unchanged, 11 tests failed: the four shared-package cases and the cases that quote the reworded messages.
- publint: hono's `publishConfig.exports` with `default` before `types`. Failed.
- attw: react's `types` pointed at a missing `.d.ts`. Failed with "Resolved through fallback condition" under node16-esm and bundler.
- API report: `export const added = 1` in react. Failed with the diff `+ export const added: 1;` and the update command. With `CI=true` and react's report deleted, it failed too.
- Catalog: a `left-pad` entry no manifest used. Failed.
- knip: an unused export in guard, an orphan file in react and an unused `jose` dependency in react. All three reported, exit 1.
- Turbo inputs: `import "@robkit/core"` added to `tooling/e2e/src/clean-path.ts`. repo-checks re-ran and failed instead of passing from cache.

### Gate results on Windows, no Docker

- `pnpm check --force` (cold): 54 seconds wall time, 42 of 42 tasks passed. Warm, with turbo's cache: 6 seconds.
- `pnpm turbo run lint typecheck`: 33 of 33 tasks passed.

### Not verified

- The Docker tests (`test` in core, dev, test-postgres and e2e) didn't run here. I didn't change core's or dev's code. The e2e change is the expected message strings. The coordinator's WSL run of `pnpm check:all` covers the last criterion, so it stays unticked.

### For AGENTS.md and CONTRIBUTING (ticket 01)

- Commands: `pnpm check` is the fast gate, runs on Windows without Docker, in about a minute cold. `pnpm check:all` is what CI runs. `pnpm --filter @internal/repo-checks api:update` rewrites the API reports after an intended API change. Commit the report with the change.
- Conventions: a new edge between workspace packages goes in `tooling/repo-checks/src/package-graph.ts`, in the same commit as the `package.json` change. A new published package gets an entry there and an `api-report.md`. A package whose tests need no Docker defines `test:unit` as well as `test`.
- The install's layer rule now binds shared packages. The robkit `AGENTS.md` bullet on `robkit check` and "An install has its own layer rule, for its apps" should say "for its apps and shared packages".
