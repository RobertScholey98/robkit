# robkit quality report (reviewer: Sonnet 5.5)

Commit: 6b912f9. Scope: root config and docs, `tooling/eslint`, `tooling/repo-checks`, `.github`, `.husky`, and the source and tests of `packages/core`, `session`, `guard`, `create-robkit` (src only, plus the templates' file list), `dev`, `hono`, `start` and `react`. I read `tooling/e2e` only for its file list and its casts. I did not read `.scratch/quality-hillclimb/` other than the rubric. I did not run Docker-backed suites.

## Scores

| #   | Category               | Score | One-line reason                                                                                                                                                         |
| --- | ---------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Module boundaries      | 8     | An enforced package graph plus a layer lint rule and subpath exports; `@robkit/session` is a grab-bag and `@robkit/core` leaks drizzle types.                          |
| 2   | Public API design      | 8     | Small entries, branded `Slug`, generated API reports and type-level tests; `session/input` exports a wide set of readers.                                               |
| 3   | Type safety at the edges | 8   | `strictTypeChecked`, one cast in shipped `packages/` source, readers at every boundary; `tooling/` casts `JSON.parse` in 12 places against its own written rule.         |
| 4   | Naming and domain language | 8 | A glossary with `_Avoid_` terms that code, docs and paths follow; nothing mechanical checks it, and small slips remain.                                                 |
| 5   | Simplicity             | 7     | 88 small source files and few dependencies, but a lot of machinery for v0.1 and a few 300 to 575 line files.                                                            |
| 6   | Consistency            | 8     | One way for input, errors, env and imports, mostly enforced; logging and the JS-versus-TS split in tooling are looser.                                                  |
| 7   | Error handling         | 8     | Values for expected failures, `Problem` and cause-preserving throws, a lint rule against silent catches, a timeout table; most `throw new Error` calls are untyped.     |
| 8   | Testing                | 8     | 552 tests through public interfaces, type tests, coverage floors and a real browser end-to-end path; `pnpm check` skips core and dev and 3 tests time out on Windows. |
| 9   | Keeping standards up   | 9     | Four custom lint rules, a dependency-graph check, API reports, changesets, commit-subject and coverage ratchets in CI, knip, strict catalog; a few gaps remain.        |
| 10  | Nice to work in as a human | 8 | Per-package READMEs, CONTRIBUTING with a worked change, architecture page, ADRs, glossary; Windows needs WSL and the fast gate was not clean here.                      |

## Measurements

Counted over `git ls-files` at 6b912f9. "Shipped source" means `packages/*/src` and `tooling/*/src` excluding tests, `test/` folders and `templates/`: 88 files, 9,938 lines.

| Measure                                                                 | Result                                                                                                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace packages                                                      | 8 published in `packages/`, 6 private in `tooling/`                                                                                                 |
| Runtime dependencies per published package                              | core 6, create-robkit 5, dev 2, guard 0, hono 2, react 1, session 2, start 2                                                                        |
| Catalog entries (`pnpm-workspace.yaml`, `catalogMode: strict`)          | 50, every one pinned exactly                                                                                                                        |
| `any` in shipped source                                                 | 0 (`as any` appears once, in the generated `templates/stacks/start/src/routeTree.gen.ts`, which also has `eslint-disable` and `@ts-nocheck`)        |
| `@ts-ignore` / `@ts-nocheck` in non-generated code                      | 0                                                                                                                                                   |
| `@ts-expect-error`                                                      | 20, all in `*.test-d.ts` files, each with a reason                                                                                                  |
| `eslint-disable` in non-generated code                                  | 0 (the lint config demands a description on any suppression and fails an unused one)                                                                |
| Non-null `!` assertions in shipped source                               | 0                                                                                                                                                   |
| `as` casts in `packages/*/src`                                          | 1 real cast (`packages/create-robkit/src/coolify.ts:210`, `JSON.parse(raw) as unknown`, which widens) and one SQL alias                             |
| `as` casts in `tooling/*/src`                                           | 12, mostly `JSON.parse(...) as {...}`: `repo-checks/src/{api-report,catalog,coverage-thresholds,graph-check,published}.ts`, `e2e/src/{install,own-ci,install-journeys,production-stack}.ts` |
| `throw new Error` in shipped source                                     | 31, of which about one passes `cause` (the rest are in places with no caught error to pass)                                                         |
| `process.env` reads in shipped `packages/` source                       | 4 call sites, every one passed straight to a reader (`readCoreConfig(process.env)` and similar)                                                     |
| `console.*` in shipped source                                           | 46 uses across 10 files (CLI output, dev runner, `logError` default); there is no logger abstraction                                                |
| Test files / `it` and `test` calls                                      | 85 test files (78 outside `templates/`), 552 tests                                                                                                  |
| Largest shipped files                                                   | `create-robkit/src/coolify.ts` 575, `e2e/src/production-stack.ts` 529, `e2e/src/install-journeys.ts` 494, `core/src/app.ts` 466, `session/src/request-guard.ts` 416 |
| Custom ESLint rules (`tooling/eslint`)                                  | 4 (`layer`, `core-schema`, `no-silent-catch`, `relative-import-extension`), each with a test file, plus `suppressions.test.js`                      |
| CI workflows                                                            | `ci.yml`, `nightly.yml`, `production.yml`; one `gate` job as the single required check                                                              |
| `pnpm install --frozen-lockfile`                                        | Passed (310 packages)                                                                                                                               |
| `pnpm check` on Windows                                                 | Prettier passed, knip passed, lint and typecheck passed for all 14 workspaces, 41 of 42 tasks passed in 2m26s. `create-robkit#test:unit` failed: 3 tests timed out at 30s (`add.test.ts`, `deployment.test.ts`, `robkit.test.ts`). I reran those three files alone: 35 of 35 passed in 16.7s. So it is load-sensitive, not broken. |
| Packages with a `test:unit` script (the ones `pnpm check` runs)         | guard, hono, react, session, start, create-robkit and the tooling packages. `@robkit/core` and `@robkit/dev` have only `test`, so the fast gate skips them. |

## 1. Module boundaries: 8/10

What they do well:

- The dependency direction is declared once and checked. `tooling/repo-checks/src/package-graph.ts` lists each package's allowed `dependencies` and `devDependencies`, and `tooling/repo-checks/src/graph-check.ts` compares that to every manifest and to the imports actually in the files (it walks them with the TypeScript compiler, `graph-check.ts:1-70`). A new edge fails a test.
- A second, finer check sits in ESLint. `tooling/eslint/layers.js:38-70` is a table of rows: session and guard import no framework, the guard imports no Node built-in and uses no `fetch` or `process`, adapters never import `@robkit/core` by name or by a relative path into `packages/core`. Each row's message names the rule, and `layers.test.js` covers it.
- The guard is a real pure core (0 runtime dependencies in `packages/guard/package.json`), with `@robkit/session` running it on a web-standard `Request` and the three adapters staying thin (`hono` 5 source files, `react` 4, `start` 5).
- Subpath exports hide a lot: `@robkit/session` exports `.`, `./addresses`, `./input` and `./lapsed` only (`packages/session/package.json:7-12`), and `./lapsed` imports nothing so a browser can load it. `@robkit/core`'s whole entry is 7 lines (`packages/core/src/index.ts`).
- knip (`knip.jsonc`) fails on unused exports and dependencies, which keeps modules from growing hidden public surface.

Weaknesses:

- `@robkit/session` is a grab-bag. It holds the session token (`session-token.ts`), the request guard runner (`request-guard.ts`), core-key and access fetching, install addresses, loopback fetch and the shared input readers (`input.ts`, 315 lines, which also reads `DATABASE_URL`, `HOST` and `PORT`). Core, the dev runner, init and every app import `session/input` for readers that have nothing to do with sessions. The package name no longer predicts its contents.
- `@robkit/core`'s entry exports `createDatabase` and `Database`, whose inferred type is drizzle's `PostgresJsDatabase<...> & { $client: postgres.Sql }` (`packages/core/api-report.md`). Callers receive a driver's type through the boundary.
- `@robkit/core` lists `@robkit/dev` as a devDependency, and the graph check allows it. That is reasonable for tests but it means core's tests reach into the runner.
- The repo does not use TypeScript project references, so `tsc` in each package resolves workspace packages through `src` exports. That is fine here, but the build order is carried by turbo's `^build` alone.

Worth copying into robkit:

- Nothing to copy from the others is needed for the graph itself. The next step is to split `@robkit/session/input` into its own `@robkit/input` package (or move the generic readers there), so the name says what is inside and the layer table can say "input imports nothing".

## 2. Public API design: 8/10

What they do well:

- Every published package has a generated `api-report.md` built from its `.d.ts` by `tooling/repo-checks/src/api-report.ts`. A test fails when the report and the build differ, so an API change appears in the diff. `pnpm --filter @internal/repo-checks api:update` rewrites it (`AGENTS.md`).
- Type-level tests pin the misuse the API is meant to stop: `packages/session/src/request-guard.test-d.ts:33-46` expects an error when a plain string stands in for a `Slug`, when core's origin is missing, and when a manifest's role names stand in for role ids. Hono, start, react and guard have the same (`guarded.test-d.ts`, `guard.test-d.ts`, `session-fetch.test-d.ts`).
- Semantic primitives are branded and have one maker: `Slug` comes only from `readSlug` (`packages/session/src/install-addresses.ts`, `AGENTS.md` "Apps in an install").
- `AccessRule` is a discriminated union (`{ kind: "open" }`, roles, owner-only) and the guard's decision is `allow | login | refresh | not-found`, so callers switch instead of testing flags.
- Package READMEs carry an exports table and a runnable example (`packages/session/README.md:7-50`).
- `publishConfig` plus a pack-and-check step (`tooling/repo-checks/src/published.ts`, using publint and arethetypeswrong) fails when an export points at a non-JS file or a wrong type path.

Weaknesses:

- `@robkit/session/input` exports about 15 functions and types at the same level (`readSet`, `readPort`, `readHost`, `readDomain`, `readCoreUrl`, `readDatabaseUrl`, `isRecord`, `isProblem`, `allProblems`, `Env`, `InputProblem`, `DeclaredApp` and so on). A newcomer cannot tell which are the primitives and which are one-off readers for a single caller.
- `isProblem(value: unknown)` accepts any record with a string `error` field (`input.ts:14-16`), so a legitimate value with an `error` field is misread as a problem. The reader convention of returning `T | InputProblem` leaves the discrimination to a runtime shape test, not the type.
- `createApp` takes `domain: string` and `db: Database` where `Database` is a drizzle type, and a `now` and `logError` that are test seams exposed as options. They are documented, but they widen the surface.
- The `@robkit/core` options object has `trustedProxy?: TrustedProxy | undefined` (`app.ts`), an explicit `| undefined` to satisfy `exactOptionalPropertyTypes`, which leaks a compiler setting into the API.

To raise this by one point:

- Tag the input result so `T | InputProblem` is discriminated by the type, not by `"error" in value`: return `{ ok: true, value } | { ok: false, error }`, or make `InputProblem` a class that `isProblem` checks with `instanceof`. Files: `packages/session/src/input.ts`, then its callers (`packages/core/src/env.ts`, `apps.ts`, `client.ts`, `packages/create-robkit/src/choices.ts`, `coolify.ts`, `env.ts`).
- Split `packages/session/src/input.ts` into generic primitives (`readSet`, `readPort`, `isRecord`, `allProblems`) and named config readers that live next to their one consumer (`readDatabaseUrl` in core and apps' env, `readDomain` with the addresses). Then trim the `./input` export to the primitives and regenerate `packages/session/api-report.md`.
- Stop exposing drizzle through `createDatabase`'s return: export `Database` as a named interface or opaque type in `packages/core/src/database.ts` so `api-report.md` no longer prints `PostgresJsDatabase`.

## 3. Type safety at the edges: 8/10

What they do well:

- `tooling/eslint/index.js:34-47` applies `strictTypeChecked`, `stylisticTypeChecked` and `@typescript-eslint/no-unsafe-type-assertion` as an error in every non-test TypeScript file. In shipped `packages/` source there is one `as unknown` (a widening) and no `any`.
- Every environment read passes through a reader: the four `process.env` call sites in `packages/` all hand it to `readCoreConfig`, `readGuardEnv`, `readDatabaseUrl` or `readServeEnv`; none read `process.env.X` directly (templates included, apart from `NODE_ENV` in `templates/base/apps/admin/src/server.ts:10`).
- HTTP bodies are read as `unknown` and narrowed: `fieldsOf` in `packages/core/src/app.ts:84-91` takes `c.req.json()` into `unknown` and `isRecord`, and each route uses a reader (`readCredentials`, `readNewOwner`, `readNewRole`, `parseAccessCode`).
- Token claims are verified and parsed, not trusted: `packages/session/src/session-token.ts` returns typed claims from `readSessionToken` and `readAppToken`.
- Type tests assert that the compiler rejects the wrong thing (20 `@ts-expect-error` lines across 5 `*.test-d.ts` files).
- The docs say what the rule is (`docs/conventions/input.md`) and a changeset records the sweep (`.changeset/parse-every-input.md`).

Weaknesses:

- The written rule is "It never casts" (`docs/conventions/input.md:13`), but `tooling/` has 12 casts, and 8 of them are `JSON.parse(await readFile(...)) as {...}` on files read from disk: `tooling/repo-checks/src/graph-check.ts:42`, `published.ts:31` and `:70`, `catalog.ts:60` and `:94`, `api-report.ts:82`, `coverage-thresholds.ts:75`, `tooling/e2e/src/own-ci.ts:18`. The lint rule does not catch them because `JSON.parse` returns `any`, and asserting from `any` is not "unsafe" to that rule. So the machine check has a hole exactly where the convention is strictest.
- `coolify.ts:210` returns `JSON.parse(raw) as unknown`, which is safe, but it sits next to hand-rolled response reading, so Coolify's API shape is checked field by field in `coolify.ts` rather than through one reader module.
- `packages/core/src/app.ts` uses `c.req.query("next")` and `c.req.valid("query")` through a `validator` whose return type is built by hand; the 400 path and the typed path are written twice.
- There is no runtime schema library. The hand-written readers are small and well tested, but they must be kept in step with the types by hand (for example `ViewerClaims` and `readViewerClaims`).
- None for the compiler flags: `tooling/typescript/base.json` turns on `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` and `erasableSyntaxOnly`.

To raise this by one point:

- Close the `any` hole. Add a lint rule (or extend `tooling/eslint/index.js`) that bans `JSON.parse(...) as X` and `.json() as X`, for example `no-restricted-syntax` on `TSAsExpression > CallExpression[callee.object.name="JSON"][callee.property.name="parse"]`. Then replace the 12 tooling casts with `isRecord`-based readers or a small `readJsonFile(path, read)` in `tooling/repo-checks/src/` that returns `unknown`. Files: `tooling/eslint/index.js`, `tooling/repo-checks/src/{graph-check,published,catalog,api-report,coverage-thresholds}.ts`, `tooling/e2e/src/{install,own-ci,install-journeys,production-stack}.ts`.
- Make the 400 branch and the typed result of a route one expression: have each reader return the parsed value or `InputProblem`, and write one `route(read, handle)` helper in `packages/core/src/app.ts` so no route builds its own `validator` callback.

## 4. Naming and domain language: 8/10

What they do well:

- `GLOSSARY.md` (89 lines) defines install, core, hub, admin, owner, guest, access code, role, guard, viewer and slug, and each entry has an `_Avoid_` line (for example guest avoids "user" and "member"; install avoids "instance" and "deployment"). `AGENTS.md` and `CLAUDE.md` tell contributors to use the terms in code, tests and commits.
- File names match the concepts a newcomer would search for: `packages/core/src/{access-codes,roles,owner,sessions,signing-key,rate-limit}.ts`, `packages/session/src/{core-keys,core-access,install-addresses,session-lapsed}.ts`, `packages/guard/src/{guard,conformance}.ts`. Test files sit next to their subject with the same stem.
- The domain words are in the types: `Viewer` with `kind: "owner" | "guest"`, `AccessRule`, `Slug`, `InputProblem`, `TrustedProxy`.
- A rename was done across the code instead of left half done: `git log` shows "Rename session's Problem type to InputProblem", so `Problem` now means only the CLI error from `@robkit/dev`, as `docs/conventions/errors.md` says.

Weaknesses:

- Nothing enforces the glossary. A `_Avoid_` word ("user", "instance", "backend") can appear in code with no failure. A cheap check would be a test that greps source and docs for the avoided words.
- Small slips: `packages/session/src/input.ts:3-4` says "a InputProblem", and the same file's header comment calls the type "Problem" in places. The session package holds "input readers" and "addresses" under names that do not say so (`install-addresses.ts` is exported as `./addresses`, so file and export name differ).
- `session` names three things at once: the cookie session, the session token and the request guard's session callback (`app-session.ts`, `session-token.ts`, `session-lapsed.ts`, `core/src/session-token.ts`, `core/src/sessions.ts`). The same file name `session-token.ts` exists in two packages with different roles (core mints, session reads).
- `@robkit/dev` is "the `robkit-dev` runner and proxy" and also holds `runCommand` and `Problem`, which every command-line tool uses (`docs/conventions/errors.md`), so the name hides half the package.

To raise this by one point:

- Add a repo check that fails on glossary `_Avoid_` words in `packages/*/src`, `docs/` and `README.md` files, reading the words from `GLOSSARY.md` itself. Put it in `tooling/repo-checks/src/glossary.ts` with a test, and list intended exceptions in the check, so the glossary is a gate and not advice.
- Rename the two `session-token.ts` files by role (`packages/core/src/session-token.ts` to `mint-app-token.ts`, and keep `packages/session/src/session-token.ts` as the reader), fix the "a InputProblem" comment in `packages/session/src/input.ts:3-4`, and move `runCommand` and `Problem` out of `@robkit/dev` into the package the glossary would name.

## 5. Simplicity: 7/10

What they do well:

- The codebase is small for what it does: 88 shipped source files, 9,938 lines, 8 published packages with 0 to 6 runtime dependencies each (`packages/guard` has none). The catalog has 50 pinned entries, and a repo check (`tooling/repo-checks/src/catalog.ts`) fails on an unused one.
- Features trace in a few files. A request: adapter (`packages/hono/src/guarded.ts`) to `requestGuard` (`packages/session/src/request-guard.ts`) to the pure `guard` (`packages/guard/src/guard.ts`). Sign-in: `app.ts` route to `owner.ts`/`sessions.ts` to `session-token.ts`. `docs/architecture.md` draws both.
- Dead code is policed by knip with a short ignore list (`knip.jsonc`, each ignore explained).
- Abstraction is mostly earned: the layer rule is data (`layers.js`), the readers are plain functions, and `memoize` in `app.ts:117-124` is five lines.

Weaknesses:

- Several files are long for one idea: `packages/create-robkit/src/coolify.ts` (575 lines, API client, plan, deploy loop and logging together), `packages/core/src/app.ts` (466 lines, every route plus CORS, limits and cookies inside one `createApp` closure), `packages/session/src/request-guard.ts` (416 lines).
- The v0.1 scope is wide: a Coolify deployer, a vendoring command, a production-in-Docker test with Caddy standing in for a Cloudflare tunnel, a shadcn UI kit committed in templates, and a theme journey. Each is documented and tested, but a reader must carry all of it. `AGENTS.md` is 169 lines of dense bullets.
- `tooling/e2e` is 20 files of journeys and harness (`production-stack.ts` 529 lines, `install-journeys.ts` 494 lines) with its own browser plumbing, process watchers and network-settling waits (`AGENTS.md` "Tests that start Docker").
- Two-level indirection in tests: `@internal/test-session` and `@internal/test-postgres` are packages with their own tests, which is clean but adds hops when a test fails.
- `.scratch/` (planning, tickets, hillclimb folders) lives inside the repo tree next to the code and is referenced by `CLAUDE.md` and `AGENTS.md`, so a reader meets process material before code.

To raise this by one point:

- Split `packages/core/src/app.ts` into route modules (`routes/session.ts`, `routes/owner.ts`, `routes/apps.ts`, `routes/roles.ts`, `routes/codes.ts`), each exporting `(app, deps) => void`, leaving `app.ts` to build shared context, CORS and the error handler. The test file `app.test.ts` should not change.
- Split `packages/create-robkit/src/coolify.ts` into the API client (`coolify-api.ts`), the plan (`coolify-plan.ts`) and the deploy loop (`coolify-deploy.ts`), and cut `packages/session/src/request-guard.ts` the same way (callback handling versus decision).

## 6. Consistency: 8/10

What they do well:

- Config and env: every entry point reads `process.env` once into a reader (`readCoreConfig`, `readGuardEnv`, `readServeEnv`, `readDatabaseUrl`), in core, the templates' servers and the dev runner alike.
- Errors: expected failures are returned values and unexpected ones throw, in the same shape in core (`claimInstall` returning `{ outcome: "taken" }`), the guard and the CLI (`docs/conventions/errors.md`). Every command line goes through `runCommand`.
- Imports: `robkit/relative-import-extension` forces `.ts` extensions, `layer` forces the direction, and Prettier plus a pre-commit hook format everything. `app.ts` and `request-guard.ts` read the same way.
- File layout: each package has `src/`, `README.md`, `api-report.md`, `eslint.config.js`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` in the same shape (`ls packages/*`). Tests sit next to their subject.
- Scripts: every package has `build`, `lint`, `typecheck`, `test` under the same names, so turbo tasks line up (`turbo.json`).
- Commit subjects are checked in the hook and in CI, so the history reads as one author.

Weaknesses:

- Logging has no single path. Core takes a `logError` option, the guard takes `onUnavailable`, the CLIs print with `console.*`, and the dev runner prints with its own helpers (46 `console.*` uses in 10 files). The two injected seams have different names and shapes for the same job.
- `tooling/eslint` is plain JavaScript with JSDoc types while everything else is TypeScript, so the strictest code in the repo (the rules) is typed by comment, and the repo-wide "no cast" rule does not apply to `.js` (`tooling/eslint/index.js:43-47` disables type-checked rules for `*.js`).
- The tooling packages do not follow the input convention (12 `JSON.parse ... as` casts), so the tooling and the shipped packages look like two authors.
- Test timeouts differ: `packages/create-robkit/src/robkit.test.ts:27` sets 30 seconds on one `describe`, core sets 120 seconds globally (`packages/core/vitest.config.ts:6-7`), and repo-checks got "30 seconds under load" in a recent commit. Slow-test handling is per file.
- `core` and `dev` define only `test`, while the others define `test` and `test:unit`, so the fast gate treats packages unevenly (see Testing).

To raise this by one point:

- Pick one logging seam. Define `type Report = (message: string, cause?: unknown) => void` once in `@robkit/session` (or the package that owns input and problems), rename core's `logError` and the guard's `onUnavailable` payload to use it, and make the CLIs write through one `report` function in `@robkit/dev`. Files: `packages/core/src/app.ts`, `packages/session/src/request-guard.ts`, `packages/dev/src/cli.ts`, `packages/create-robkit/src/{bin,robkit}.ts`.
- Add `test:unit` to `packages/core/package.json` and `packages/dev/package.json` (even if they run only the Docker-free subset) so all eight packages expose the same scripts, and have `tooling/repo-checks` assert that every workspace package defines `build`, `lint`, `typecheck` and `test`.

## 7. Error handling: 8/10

What they do well:

- Expected failures are values; unexpected ones throw with a cause. `docs/conventions/errors.md` states the rule, and the code follows it: the guard returns `allow | login | refresh | not-found`, core returns `{ outcome: "taken" }`, and `memoize` in `app.ts:117` rethrows with the original error after clearing its cache.
- Two lint rules enforce it. ESLint's `preserve-caught-error` with `requireCatchParameter` fails a `throw` in a `catch` without `cause` (`tooling/eslint/index.js:61`), and `robkit/no-silent-catch` (`tooling/eslint/no-silent-catch.js`) fails any `catch` or `.catch()` that never reads its error and has no explaining comment. Of the 47 `catch` sites in shipped source, those I read (`app.ts:62-69`, `app.ts:84-91`, `memoize`) each translate, recover with a comment, or rethrow.
- Messages say what to do next: `ROBKIT_APPS must be a JSON list of apps, such as [{"slug": "notes"}]. pnpm dev and robkit deploy set it from each app's manifest.` (`packages/core/src/apps.ts:58`), `Set COOLIFY_TOKEN to deploy.` (`docs/conventions/errors.md`), and the database-unreachable log "Check DATABASE_URL and that Postgres is running." (`app.ts`, tested at `app.test.ts:43-45`).
- Boundaries convert errors: one `app.onError` logs the route and cause and answers a generic 500 (`app.ts:136-143`), so no stack leaks to the caller; the guard answers 503 and reports `core-key`, `access-rule` or `network` through `onUnavailable`; the CLIs throw a `Problem` that prints its message alone and exit 1.
- Every outbound request has a deadline, with a table of the limits in `docs/conventions/errors.md`.
- A recent commit tests a negative security case: "Test that core refuses a stored signing key that is a secret" (`packages/core/src/signing-key.test.ts`).

Weaknesses:

- Typed errors are thin. The only classes are `Problem` and `CoreUnreachableError`; the other 31 `throw new Error(...)` sites are plain `Error` with a message, so a caller cannot branch on kind. Only one site in that grep passes `cause`, because most are not in a `catch`, but several messages are still generic.
- `isProblem` is a shape test on `{ error: string }`, so a successful value that happens to have an `error` string is read as a failure.
- Logging is `console.error` by default in core with no level or structure, so an operator cannot filter by route or severity.
- `catch` sites that discard on purpose (for example `hostnameOf` in `app.ts:62-69`) are allowed by a comment, which a human must judge for sense; the rule checks the comment exists, not that it is true.
- The 500 body ("Core hit an unexpected error. Its log says what went wrong.") sends the person to a log but gives no request id to find the entry.

To raise this by one point:

- Give faults a small class hierarchy or tag in `packages/session` and `packages/core`: for example `class RobkitError extends Error { readonly kind: "config" | "unreachable" | "invariant" }`, and convert the generic `throw new Error` sites in `packages/core/src/{signing-key,sessions,migrate}.ts` and `packages/create-robkit/src/{coolify,generate,add}.ts` so callers and tests can match `kind` instead of message text.
- Put a request id on core's 500 and on the matching `logError` line (`packages/core/src/app.ts:136-143`) so a person who sees the generic body can find its cause in the log.

## 8. Testing: 8/10

What they do well:

- Volume and level: 552 tests in 85 files. Core's tests drive the Hono app through `app.request(...)` against a real Postgres and assert on status and body, not on internals (`packages/core/src/app.test.ts:27-80`, `setup.test.ts`, `login.test.ts`, `refresh.test.ts`). Imported helpers are not mocked.
- A shared conformance suite: `packages/guard/conformance.json` is read by the guard and by every adapter's tests, so all four implement the same cases (`packages/guard/src/conformance.ts`).
- Type-level tests with `vitest --typecheck` run in the unit scripts (`packages/session/package.json` `test:unit`), so API misuse that must not compile is tested.
- Coverage floors on every package (`packages/core/vitest.config.ts:8-12`: 95/95/90/96), and `tooling/repo-checks/src/check-coverage-thresholds.ts` fails a pull request that lowers one.
- The end-to-end path is real: `tooling/e2e` generates two installs on different stacks, runs them under the dev runner and drives Chromium through the owner, guest, role, added-app, server-function and theme journeys with axe accessibility checks, and runs the install's own CI workflow with a `PATH` that cannot see `node_modules/.bin` (`AGENTS.md` "The whole-stack test", `tooling/e2e/src/own-ci.ts`). A separate `test:production` builds Docker images and runs the journey over https.
- Test infrastructure is cleaned up on exit: `removeWhenGone` registers a detached watcher so a killed run leaves no containers.
- Repo rules are themselves tested: each ESLint rule has a test, and `repo-checks` has tests for the graph check, API report, catalog, commit subjects and coverage thresholds.

Weaknesses:

- The fast gate skips the most important package. `pnpm check` runs `turbo run ... test:unit`, and `packages/core/package.json:31` and `packages/dev/package.json:36` define only `test`, so core (the auth backend) and dev are never run by the gate a contributor is told to use while working. Only `check:all` on Linux with Docker covers them.
- On this Windows run, `pnpm check` did not pass: `create-robkit#test:unit` timed out on 3 tests at 30s (`src/add.test.ts`, `src/deployment.test.ts`, `src/robkit.test.ts:28`). The same three files passed alone in 16.7s, so it is load, but the timeout is tight enough that the gate that is documented as "under a minute" took 2m26s and failed. A recent commit already raised repo-checks to 30s for the same reason.
- Some create-robkit tests generate and install whole project trees inside unit tests, which makes them slow and sensitive to the machine.
- Core tests share one Postgres per suite and depend on Docker. There is no in-process fake for the database, so any core change needs Docker to verify.
- Some e2e files assert with casts (`as string` on `expect.stringMatching` in `install-journeys.ts:63,75,306,371`), which is harmless but shows the helper types are loose.
- I did not measure whether a pure refactor leaves tests unchanged; the tests I read go through the app and the readers, so most would, but `repo-checks` tests build fake packages in temp folders with hand-written `.d.ts` text, which tie them to the output format.

To raise this by one point:

- Add `"test:unit"` to `packages/core/package.json` and `packages/dev/package.json` that runs the tests not needing Docker (for example core's readers and pure modules: `env.test.ts`, `client.test.ts`, `codes.test.ts`, `password.test.ts`, `access-codes.test.ts`) and add a repo check that every package with a `test` script also has `test:unit`. That puts the auth backend inside the gate that runs on Windows.
- Make the slow create-robkit tests fast and stable: generate the install once in a `beforeAll` per file (`packages/create-robkit/src/add.test.ts`, `deployment.test.ts`, `robkit.test.ts`) and give them a timeout in `packages/create-robkit/vitest.config.ts` instead of per-`describe` literals, so a loaded machine does not fail the gate.

## 9. Keeping standards up: 9/10

What they do well:

- Custom lint rules with tests: `layer` (the layer table), `core-schema` (core's tables must be declared in the core schema), `no-silent-catch`, `relative-import-extension`, each in `tooling/eslint/*.js` with a `*.test.js`, plus `tooling/eslint/suppressions.test.js`. `AGENTS.md` says "A new rule goes in with its lint rule, in the same commit."
- A suppression policy as config: `tooling/eslint/index.js:70-77` requires a description on every `eslint-disable` and fails an unused one. Non-generated code has 0 `eslint-disable`.
- Package graph enforced by a test (`tooling/repo-checks/src/graph-check.ts`), including declared versus imported dependencies.
- API reports generated and compared (`tooling/repo-checks/src/api-report.ts`, `packages/*/api-report.md`), and published-package checks with publint and arethetypeswrong (`published.ts`).
- Release tooling: changesets (`.changeset/config.json`) with `changedFilePatterns` limited to `src/**`, and CI runs `pnpm changeset status --since="$BASE"` on pull requests (`.github/workflows/ci.yml:65`).
- Ratchets: coverage thresholds per package, checked against the base branch (`check-coverage-thresholds.ts`, `ci.yml:63`), and a strict catalog (`catalogMode: strict`) with a check that every catalog entry is used (`catalog.test.ts`).
- Hooks: Husky `pre-commit` runs lint-staged (ESLint fix on staged code, Prettier on everything) and `commit-msg` runs `check-commit-subjects.ts`, which CI runs again over the pull request's range (`ci.yml:62`). The whole-stack test even checks that the generated install's pre-commit hook refuses a layer-rule breach.
- CI: one `gate` job as the single required check (`ci.yml:69-77`) that fails on failure, cancellation or a skipped pull-request job; Prettier, knip, lint, typecheck and every test run in `check:all`; nightly and production workflows for the slow suite.
- Contributor rules for agents: `AGENTS.md`, `CLAUDE.md`, a pull request template and `CODEOWNERS`; the install's template carries its own `AGENTS.md`, lint-staged and Husky so users inherit the setup.
- Dead code and unused dependencies fail the build through knip.

Weaknesses:

- The input convention is only partly mechanical. The rule "a reader never casts" is stated and linted, but `no-unsafe-type-assertion` does not see `JSON.parse(...) as X` (12 casts in `tooling/`), so the gate does not stop the most common way to break it.
- The glossary, the "one commit, one thing" rule and "no `and` in a subject" are only partly enforced; `check-commit-subjects.ts` checks the subject form, but nothing checks the glossary or commit size.
- The pull request template's checkboxes are not verified, and `CODEOWNERS` has one owner, so review is a process, not a gate (the gate job does not require an approval; that depends on branch protection that I cannot see in the repo).
- No automated dependency update (no Dependabot or Renovate config under `.github/`), so the 50 pinned catalog versions age by hand.
- The fast gate does not run core or dev tests (see Testing), so on a developer's machine the standard is enforced less than in CI.
- Pre-commit lints only `packages/` and `tooling/` code and runs ESLint with `--fix`, which can hide a violation by rewriting it; the commit then carries a change the author did not review.

To raise this by one point:

- Add the missing machine checks: a lint selector that bans `as` on `JSON.parse` results in `tooling/eslint/index.js`, a glossary-avoid-words check in `tooling/repo-checks/src/` (see Naming), and a check that every package defines the same scripts (see Consistency). Each gets a test next to it, as the existing rules do.
- Add `.github/dependabot.yml` (or `renovate.json`) for the pnpm catalog and the GitHub Actions versions, with a grouped weekly schedule, so version drift becomes a pull request that the same gate checks.
- Make the pull request template's proof lines checkable: have a CI step fail when the `Ticket` section is empty or points at a missing file (`.github/workflows/ci.yml` `pull-request` job plus a small script in `tooling/repo-checks/src/`).

## 10. Nice to work in as a human: 8/10

What they do well:

- Docs for every layer: root `README.md` (91 lines), `CONTRIBUTING.md` (212 lines, prerequisites, WSL steps, set-up, gates with times, a worked first change, commits), `docs/architecture.md` (181 lines with Mermaid flow and sequence diagrams and a package map), twelve one-page ADRs in `docs/adr/` each linking its ticket, `docs/conventions/{input,errors}.md`, `GLOSSARY.md`, `SECURITY.md`, and a README in every package with purpose, example, exports table and layer rule.
- One-command setup and a try-it loop: `pnpm install`, then `pnpm create-install ../my-install --stack start` makes a linked install to run with `pnpm dev`; `.node-version`, `packageManager` and `engines` pin the toolchain.
- Scripts have obvious names (`check`, `check:all`, `create-install`, `api:update`, `changeset`), and `package.json` carries a `"//"` comment saying what each gate runs and whether it needs Docker.
- Comments explain why, not what: `app.ts:70-75` and `:166-190` explain the CORS preflight trick, why the codes' limiter is separate from the owner's, and why the cookie has no `Domain`; `coolify.ts:170` explains the redirect rule (Cloudflare).
- Contributor errors name the rule: the layer rule messages say `Layer rule: @robkit/guard does no I/O.` and the e2e failure output prints what the browser saw and what the dev runner said (`AGENTS.md` "The whole-stack test").
- Folder layout is predictable (`packages/<name>/src`, `tooling/<name>`, `docs/{adr,conventions}`), and tests live beside their subjects.
- The fast gate is cached by turbo (13 of 42 tasks were cached on my run), and the unit suites for session (224 tests), guard, hono, start, react and repo-checks finish in seconds.

Weaknesses:

- The full suite and `pnpm dev` need Linux or macOS; Windows contributors must set up WSL, Docker Desktop's WSL integration and a credential-helper workaround (`CONTRIBUTING.md` "On Windows, use WSL"). On plain Windows the documented "under a minute" `pnpm check` took 2m26s here and failed on 3 load timeouts.
- There is no playground inside the checkout; the "example" is generated by `create-install` into another folder.
- `AGENTS.md` is 169 lines of dense bullets, much of it about test-harness detail (network interfaces, `ERR_NETWORK_CHANGED`, Docker Desktop's VM), which a first-day contributor does not need and cannot easily skim. `README.md` for `@robkit/session` says an app does not import it, but the package is also where input readers live, which is easy to miss.
- Planning material (`.scratch/`, `docs/agents/`, `.skills/`) sits at the top level next to code, and `CLAUDE.md` makes the ticket flow the first thing a reader sees.
- Some files are long enough that the entry is not enough to learn them (`coolify.ts` 575, `app.ts` 466), and `app.ts` has no section headers.

To raise this by one point:

- Make the fast gate pass on Windows without WSL: add `test:unit` to core and dev (see Testing) and give `packages/create-robkit/vitest.config.ts` a single generous `testTimeout` so `pnpm check` is green and honest about its time. Then update the table in `CONTRIBUTING.md` ("Under a minute") to the measured time.
- Split `AGENTS.md` so the top 40 lines are what a contributor needs on day one (commands, the layer rule, where things are) and move the Docker-test and production-test detail into `docs/testing.md`, linked from `CONTRIBUTING.md`.
- Add a one-page "your first change" check to `CONTRIBUTING.md` that you can run: a failing example (add a framework import to `packages/guard/src/guard.ts`) and the exact lint message it prints, so the layer rule is seen working on day one.

## Top 5 practices to copy

1. A dependency graph declared once and checked against both manifests and real imports, backed by a data-driven layer lint table whose messages name the rule. `tooling/repo-checks/src/package-graph.ts`, `tooling/repo-checks/src/graph-check.ts`, `tooling/eslint/layers.js`.
2. Generated API reports committed beside each package and compared by a test, plus type-level `*.test-d.ts` files that pin what must not compile. `tooling/repo-checks/src/api-report.ts`, `packages/core/api-report.md`, `packages/session/src/request-guard.test-d.ts`.
3. Rules that police their own escape hatches: required descriptions on suppressions, unused suppressions as errors, `no-silent-catch`, `preserve-caught-error`. `tooling/eslint/index.js:61-77`, `tooling/eslint/no-silent-catch.js`.
4. One conformance file shared by the pure core and every adapter, so four implementations prove the same cases. `packages/guard/conformance.json`, `packages/guard/src/conformance.ts`.
5. Ratchets checked against the pull request's base, plus one `gate` job as the single required check. `tooling/repo-checks/src/check-coverage-thresholds.ts`, `.github/workflows/ci.yml:62-77`.
