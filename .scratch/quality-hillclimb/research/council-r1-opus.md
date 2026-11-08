# robkit quality report

Commit: 6b912f9. Scope: every published package under `packages/` (core, session, guard, hono, start, react, dev, create-robkit `src/`), `tooling/` (eslint, repo-checks, test-postgres, test-session, typescript, and e2e by outline), the root config, `.github/`, `.husky/`, `docs/`, the root docs and each package README. I read the templates under `packages/create-robkit/templates/` only where a finding needed it, and counted them apart from robkit's own source. I did not read `.scratch/quality-hillclimb/` beyond the rubric, and did not run Docker-backed suites (core, dev, e2e).

## Scores

| # | Category | Score | One-line reason |
| - | -------- | ----- | --------------- |
| 1 | Module boundaries | 8 | One-way graph enforced twice (ESLint rule and a package-graph repo check); adapters are tiny. `@robkit/session` has become a grab bag of 58 exported declarations. |
| 2 | Public API design | 7 | Adapters export 1 to 4 names, a Slug brand and type tests stop misuse. `@robkit/dev` and `@robkit/session` export a lot, some of it with no outside caller, and one README example doesn't compile. |
| 3 | Type safety at the edges | 9 | Zero `any`, one widening `as unknown`, zero suppressions in 10,476 lines of source; strictest tsconfig; readers at every boundary; casts fail lint. IDs other than Slug are bare strings. |
| 4 | Naming and domain language | 7 | A glossary with "Avoid" lists that the code follows. `Viewer`, `OwnerViewer` and `GuestViewer` each mean two different shapes, and `@robkit/dev` runs in production. |
| 5 | Simplicity | 7 | The guard is a lookup table and adapters are 30 lines. Several 400 to 575 line files, two ways to spawn a process, and a duplicated helper. |
| 6 | Consistency | 7 | Written conventions for input and errors, mostly kept. Failures are checked two ways (`isProblem` 40 times, `"error" in` 10 times) and typed two ways (`InputProblem`, ad hoc `{ error: string }`). |
| 7 | Error handling | 8 | Expected failures are values, faults carry `cause`, and lint enforces both (I proved the rules fire). Messages mostly say what to do; a few thrown by the setup code don't. |
| 8 | Testing | 8 | 523 tests, 2 `vi.mock`, 0 `vi.fn`; tests drive HTTP and the public index; type tests; a shared conformance suite; whole-stack e2e. The fast gate runs no core test, and a cold run failed on Windows from timeouts. |
| 9 | Keeping standards up | 9 | Four tested custom lint rules, graph, catalog, API-report, pack and coverage-ratchet checks, commit-subject hook plus CI, changeset gate, one required check. README code isn't compiled, and one written rule disagrees with its check. |
| 10 | Nice to work in as a human | 8 | Excellent README, CONTRIBUTING with a worked first change, architecture diagrams, 12 ADRs, per-package READMEs, comments that say why. Windows contributors need WSL and Docker for core, and the first cold `pnpm check` failed. |

## Measurements

| What | Command or method | Result |
| ---- | ----------------- | ------ |
| Published packages | `ls packages` | 8 (core, create-robkit, dev, guard, hono, react, session, start) |
| Private tooling packages | `ls tooling` | 6 (e2e, eslint, repo-checks, test-postgres, test-session, typescript) |
| Non-test source, excluding templates | `git ls-files 'packages/*/src/**' 'tooling/*/src/**'`, minus tests and templates | 92 files, 10,476 lines |
| Template source (an install's own files) | `git ls-files 'packages/create-robkit/templates/**'` `.ts/.tsx` | 57 files, 3,175 lines |
| Test files and lines (excluding templates) | `*.test.*`, `*.test-d.ts`, `/test/` | 105 files, 11,813 lines; 523 `it(` calls |
| Type tests | `git ls-files \| grep test-d.ts` | 5 (guard, session, hono, start, react) |
| `any` in source | grep `as any\|: any` | 0 |
| Type assertions in source | grep for `x as T`, excluding `as const` and imports | 1: `packages/create-robkit/src/coolify.ts:210` `JSON.parse(raw) as unknown` (a widening) |
| `@ts-ignore` / `@ts-expect-error` in source | grep | 0 |
| `eslint-disable` in source | grep | 0 (one in the generated `templates/stacks/start/src/routeTree.gen.ts`) |
| Non-null `!` assertions in source | grep | 0 |
| `throw new Error(` in source | grep | 31 (18 more in templates) |
| `catch {` without a binding | grep | 9, each with a comment saying why |
| Largest source files | `wc -l` | `create-robkit/src/coolify.ts` 575, `e2e/src/production-stack.ts` 529, `e2e/src/install-journeys.ts` 494, `core/src/app.ts` 466, `session/src/request-guard.ts` 416 |
| `vi.mock` / `vi.fn` / `toHaveBeenCalled` in tests | grep | 2 / 0 / 1 |
| Exported declarations per package | `grep -c '^export ' packages/*/api-report.md` | session 58, dev 22, create-robkit 12, core 11, guard 10, hono 4, start 4, react 1 |
| External catalog entries | `pnpm-workspace.yaml` | 45, `catalogMode: strict` |
| Runtime deps of the backend | `packages/core/package.json` | 4 external (drizzle-orm, hono, jose, postgres) |
| Custom ESLint rules | `tooling/eslint/*.js` | 4 (`layer`, `core-schema`, `no-silent-catch`, `relative-import-extension`), each with tests, plus `suppressions.test.js` |
| Lint rules fire | Wrote an untracked probe file in `packages/session/src/` with a framework import, a silent catch, an undescribed disable, a cast and an extensionless import, ran `pnpm exec eslint`, deleted it | 10 errors, every documented rule fired |
| Fast gate, cold | `pnpm install --frozen-lockfile && pnpm check` in Git Bash on Windows | Failed after 3m04s: 7 create-robkit tests timed out at 30s (`bin.test.ts`, `check.test.ts`, `deployment.test.ts`, `robkit.test.ts`) |
| Same package alone | `pnpm exec vitest run --retry=0` in `packages/create-robkit` | 165 of 165 pass in 24s, so the failure was load |
| Fast gate, warm | `pnpm check` again | Passed in 45s, 40 of 42 turbo tasks cached; create-robkit and repo-checks reran and passed |
| Working tree after the runs | `git status --short` | Clean |
| Coverage thresholds | each `vitest.config` | guard, hono, start 100 across; session 94 to 96; core 90 to 96; create-robkit 51 to 74; dev 52 to 76; repo-checks 58 to 72; test-postgres 28 to 53 |

## 1. Module boundaries: 8/10

What they do well:
- The dependency direction is written once as data and checked mechanically. `tooling/repo-checks/src/package-graph.ts:28-80` lists every allowed workspace edge, with a comment on each odd one. `graph-check.test.ts` fails on a manifest edge or an import the graph doesn't list, on an edge no manifest has, and on a cycle (`graph-check.test.ts:54-247`), and it finds static, type, re-exported, dynamic and required imports (`:159`).
- The layer rules are an ESLint rule whose message names the rule (`tooling/eslint/layers.js:37-60`, "Layer rule: @robkit/guard does no I/O."), and a test checks the graph and the lint rule agree (`graph-check.test.ts:219`).
- The guard is pure and lint keeps it pure: it can't import a builtin or touch `fetch` or `process` (`tooling/eslint/layers.js:49-53`).
- The adapters hide everything behind one function. `packages/hono/src/guarded.ts` is 29 lines and `packages/start/src/guarded.ts` is 51; both just call `requestGuard` and map its decision.
- Each entry file is short and tells you what the package is: `packages/core/src/index.ts` is 7 lines.
- Installs get the same treatment: `robkit check` (`packages/create-robkit/src/check.ts`) is the install's layer rule, one row per rule.

Weaknesses:
- `@robkit/session` holds five concerns: tokens and cookies, `requestGuard`, install addresses, input readers, and the app manifest format (`readDeclares`, `declaresJson`, `readDeclaredApp` in `packages/session/src/input.ts:224-315`). It also holds env readers only the templates call (`readServeEnv`, `readDevServerEnv`, `readGuardEnv`, `input.ts:166-205`). Its API report has 58 exported declarations across four entry points (`packages/session/api-report.md`, 221 lines). It is the package everything depends on, so it is where shared things landed.
- The command-line error convention lives in the dev runner. `Problem`, `runCommand` and `reportFaultsAt` are in `packages/dev/src/cli.ts`, and `create-robkit` imports `Problem` from `@robkit/dev` in 11 files (`add.ts`, `bin.ts`, `check.ts`, `choices.ts`, `coolify.ts`, `robkit.ts`, `vendor.ts`, `wizard.ts`, `write.ts`, `add-wizard.ts`, `deployment.ts`).
- The rule has two homes, `layers.js` and `package-graph.ts`, kept in step by a test rather than one being derived from the other.

Worth copying from robkit:
- A package graph as data plus a test that parses every import, so a new edge is a reviewed one-line diff.
- Lint messages that name the architectural rule, not just the symptom.

To raise this by one point:
1. Split `@robkit/session/input`'s manifest format and template env readers out of session. Move `readDeclares`, `declaresJson`, `readDeclaredApp`, `DeclaredApp`, `Declares` and `DeclaredAccess` from `packages/session/src/input.ts` into a new entry `@robkit/session/manifest` (or a small `@robkit/manifest` package), and move `readServeEnv`, `readDevServerEnv` and `readGuardEnv` beside the generic readers under a `@robkit/session/env` entry, so `input` keeps only `InputProblem`, `isProblem`, `isRecord`, `parseJson` and the single-variable readers. Update `package-graph.ts`, the API reports and the callers in `packages/core/src/apps.ts`, `packages/dev/src/apps.ts` and `packages/create-robkit/src/generate.ts`.
2. Move `Problem`, `runCommand` and `reportFaultsAt` from `packages/dev/src/cli.ts` to their own entry, `@robkit/dev/cli`, so create-robkit's imports say what they take.
3. Generate the `@robkit/*` rows of `tooling/eslint/layers.js`'s adapters-never-import-core rule from `tooling/repo-checks/src/package-graph.ts`, or the reverse, so one file is the source.

## 2. Public API design: 7/10

What they do well:
- The adapters are almost impossible to misuse: `@robkit/hono` exports `guarded`, `GuardedEnv`, `GuardedOptions` and `Viewer`; `@robkit/react` exports only `sessionFetch` (`packages/react/src/index.ts`).
- Each package's public surface is snapshotted in `api-report.md`, generated from the built declarations, so an API change shows up in review (`packages/dev/api-report.md:1-3`, `tooling/repo-checks/src/api-report.ts`).
- Type tests state what must not compile: `packages/guard/src/guard.test-d.ts` uses `@ts-expect-error` to show a roles rule needs roles and an open rule takes none.
- `Slug` is a brand only `readSlug` can make (`packages/session/src/install-addresses.ts:20-46`), and every function that puts a slug into SQL, a token or an address takes it.
- Options are documented on each field, with what goes wrong if misused (`packages/session/src/request-guard.ts:26-50`: "Config, never the request's Host, so a request can't choose whose keys the app trusts").
- The packed packages are checked with publint and Are the Types Wrong (`tooling/repo-checks/src/published.test.ts:49-53`).

Weaknesses:
- `@robkit/dev` exports 22 declarations from one entry (`packages/dev/src/index.ts`). Five values have no caller outside the package: `createProxy`, `routesFor`, `readAppManifest`, `provisionApps` and `runDev` (git grep outside `packages/dev/src`, excluding READMEs and API reports). There are three provisioning entry points with overlapping jobs: `provisionDatabase(adminUrl, slug, password?)`, `provisionDatabases({ adminUrl, secret, slugs })` and `provisionApps(root, options)` (`packages/dev/api-report.md`).
- The README example for `@robkit/dev` doesn't compile against the API it documents. `packages/dev/README.md:30-42` builds `slugs` as `string[]` from `process.env` and passes it to `provisionDatabases`, whose `slugs` is `readonly Slug[]`. The real template uses `readProvisionConfig` instead (`packages/create-robkit/templates/base/apps/core/src/provision.ts`).
- `create-robkit` exports `Value` and `Deployment` (`packages/create-robkit/src/index.ts`), names too generic to guess from an import.
- `GuardFault.app` is `string` (`packages/session/src/request-guard.ts:56-58`) although the option it comes from is a `Slug`.

Worth copying from robkit:
- An `api-report.md` per package, regenerated by one command and diffed in review.
- A `*.test-d.ts` per adapter-facing package with `@ts-expect-error` cases for the misuse you most fear.

To raise this by one point:
1. Shrink `packages/dev/src/index.ts` to what installs and create-robkit import: drop `createProxy`, `routesFor`, `readAppManifest`, `runDev` and `provisionApps` from the entry (the bin imports them directly), and fold `provisionDatabase` into `provisionDatabases` (core's test setup in `packages/core/src/test/global-setup.ts` and `tooling/e2e/src/core-app.test.ts` can pass one slug). Run `api:update`.
2. Make README code blocks compile: extract the TypeScript fences from each `packages/*/README.md` into a typecheck step in `tooling/repo-checks` (for example a test that writes them to a temp folder and runs `tsc --noEmit` against the built packages). Then fix `packages/dev/README.md:30-42` to the template's `readProvisionConfig` form.
3. Rename `Value` and `Deployment` in `packages/create-robkit/src/deployment.ts` to `DeploymentValue` and `AppDeployment`, and type `GuardFault.app` as `Slug` in `packages/session/src/request-guard.ts:58`.

## 3. Type safety at the edges: 9/10

What they do well:
- `tooling/typescript/base.json` turns on `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `verbatimModuleSyntax` and `erasableSyntaxOnly`.
- ESLint runs `strictTypeChecked` and `stylisticTypeChecked`, and `@typescript-eslint/no-unsafe-type-assertion` is an error outside tests (`tooling/eslint/index.js:37-48`). My probe file's cast failed lint.
- In 10,476 lines of source: 0 `any`, 0 `@ts-ignore` or `@ts-expect-error`, 0 non-null assertions, 0 `eslint-disable`, and one assertion, a widening `JSON.parse(raw) as unknown` (`packages/create-robkit/src/coolify.ts:210`).
- External input goes through readers that return the value or an `InputProblem`: env (`packages/session/src/input.ts:48-205`), JSON (`parseJson`, `:207`), the manifest field (`readDeclares`, `:253`), HTTP bodies (`readBody` in `packages/core/src/app.ts:103-109` with readers such as `readCredentials` in `packages/core/src/owner.ts:16`), and core's answers (`readAccessRule` in `packages/guard/src/guard.ts:98-106`).
- The domain types make bad states hard to build: `SessionState` and `Decision` are discriminated unions (`packages/guard/src/guard.ts:32-42`), and the guard's table is `Record<AccessRule["kind"], Record<Asking, Outcome>>`, so a new rule kind or asker fails to compile until every cell is filled (`:50-75`).
- `docs/conventions/input.md` writes the rule down and points at the readers.

Weaknesses:
- Only slugs are branded. Role ids, code ids and viewer ids are plain `string` (`packages/guard/src/guard.ts:5-20`), so a code id can be passed where a role id is wanted.
- Readers return two problem shapes: `InputProblem` and a hand-written `{ error: string }` (`packages/core/src/owner.ts:18,29`, `packages/core/src/roles.ts:22,36`, `packages/session/src/install-addresses.ts:39`).

Worth copying from robkit:
- `no-unsafe-type-assertion` as an error outside tests, paired with a written reader convention, so the only way past a type is to parse.
- Decision tables typed as nested `Record`s over union keys.

To raise this by one point:
1. Brand the other ids the way `Slug` is branded: add `RoleId` and `CodeId` in `packages/guard/src/guard.ts`, use them in `AccessRule`, `GuestViewer` and `OwnerViewer`, mint them only in core's readers (`packages/core/src/roles.ts` `readCodeIds`, `packages/core/src/access-codes.ts`) and in `readAccessRule`, and add `@ts-expect-error` cases to `guard.test-d.ts`.
2. Replace every `| { error: string }` return in `packages/core/src/owner.ts`, `packages/core/src/roles.ts`, `packages/core/src/access-codes.ts`, `packages/core/src/apps.ts`, `packages/core/src/app.ts` (`readBody`), `packages/create-robkit/src/add.ts` and `packages/session/src/install-addresses.ts` (`readSlug`) with `InputProblem`, and the matching `"error" in x` checks with `isProblem(x)`.

## 4. Naming and domain language: 7/10

What they do well:
- `GLOSSARY.md` defines each term with an "_Avoid_" list (Owner avoids "admin" and "user"; Install avoids "instance" and "deployment") and a worked dialogue, and the code keeps to it: owner, guest, install, core, hub, admin, slug, access code, app token, viewer.
- Function names read as sentences in the domain: `signInWithCode`, `claimInstall`, `mintAppToken`, `provisionDatabases`, `readSessionLapsed`.
- Files are named after what they hold, and route tests after the route (`packages/core/src/login-code.test.ts` tests `POST /login/code`).
- Guard outcomes use the same four words in code, docs and HTTP (`allow`, `login`, `refresh`, `not-found`; `docs/architecture.md`).

Weaknesses:
- One name, two shapes. `@robkit/guard` defines `Viewer`, `OwnerViewer` and `GuestViewer` with `id` and `roles` (`packages/guard/src/guard.ts:9-26`); `packages/core/src/sessions.ts:28-41` defines `Viewer`, `OwnerViewer` and `GuestViewer` again, with `username` or `name` and no roles, and core imports the guard's `SignedInViewer` in the same file.
- `@robkit/dev` isn't only for development: core's production container runs its provision step (`packages/create-robkit/templates/base/apps/core/src/provision.ts`, and `packages/dev/README.md:5-7` says so).
- `@robkit/session` names one of five things it holds (see category 1), so a newcomer looking for "where are the install's addresses" or "where is the manifest reader" won't guess it.
- Two files named `session-token.ts` (`packages/core/src` mints, `packages/session/src` reads) and two named `env.ts`, `files.ts` and `apps.ts` across packages.
- `Problem` (a fixable command-line failure) and `InputProblem` (a bad input value) sound related and aren't.
- A rename left a typo: "returns the typed value or a InputProblem" (`packages/session/src/input.ts:3`).

Worth copying from robkit:
- A glossary whose entries list the words to avoid, used in code review and by agents.

To raise this by one point:
1. Rename core's display types in `packages/core/src/sessions.ts` to `OwnerProfile`, `GuestProfile` and `Profile` (or `SessionViewer`), add the term to `GLOSSARY.md`, and update `packages/core/src/app.ts` and the hub's and admin's client types in the templates.
2. Rename `Problem` in `packages/dev/src/cli.ts` to `CommandProblem` (or `FixableProblem`), keeping the glossary in step, and fix the typo at `packages/session/src/input.ts:3`.
3. Rename `packages/core/src/session-token.ts` to `mint-token.ts` so the two packages' token files say which side they are.

## 5. Simplicity: 7/10

What they do well:
- The heart of the product is small: the guard is one table and two functions (`packages/guard/src/guard.ts`, 107 lines); the adapters are 29 and 51 lines.
- Few dependencies: 45 catalog entries, many only for templates; core takes 4 external runtime packages, session 1 (`jose`).
- Little dead code: knip runs in the gate with a short, commented ignore list (`knip.jsonc`), and there are no TODOs in source.
- A feature traces end to end in a few files: a guarded request is adapter, `request-guard.ts`, `guard.ts`, and core's route in `app.ts`.

Weaknesses:
- Several large files mix many jobs. `packages/create-robkit/src/coolify.ts` (575 lines) holds config reading, an HTTP client with error explanation, desired-state diffing, deploy planning, wave ordering and polling. `packages/core/src/app.ts` (466 lines) holds every route plus CORS, body reading, rate limiting and memoising. `packages/session/src/request-guard.ts` (416 lines) is one factory with five inner closures.
- Two ways to run a child process: `packages/create-robkit/src/set-up.ts:4-14` (`shell: true`, plain `Error`) and `packages/dev/src/exec.ts:24-45` (`Problem`, prefixed output).
- `isMissing` is copied word for word in `packages/dev/src/files.ts` and `packages/create-robkit/src/files.ts`.

Worth copying from robkit:
- Express the policy as a table and keep the I/O outside it, so the interesting logic is one screen.

To raise this by one point:
1. Split `packages/create-robkit/src/coolify.ts` into `coolify-config.ts` (`readCoolifyConfig`, `CoolifyConfig`), `coolify-api.ts` (`call`, `get`, `explain`, `checks`) and `coolify-deploy.ts` (`syncApps`, `plan`, `waves`, `deployAndWait`, `deploy`).
2. Move core's route groups out of `packages/core/src/app.ts` into small `Hono` sub-apps per area (`routes/session.ts`, `routes/codes.ts`, `routes/apps.ts`, `routes/roles.ts`) mounted with `app.route`, leaving `createApp` as wiring and `onError`.
3. Delete `packages/create-robkit/src/set-up.ts`'s `run` and `files.ts`, and use `exec` and `isMissing` from `@robkit/dev` (or move both into the shared CLI entry suggested in category 1).

## 6. Consistency: 7/10

What they do well:
- Config, input and errors have one written way each (`docs/conventions/input.md`, `docs/conventions/errors.md`), and most code follows it.
- Every package has the same shape: `src/index.ts`, `README.md`, `api-report.md`, `eslint.config.js` calling the shared `config`, `tsconfig.json` extending the base, a `vitest.config.ts` with thresholds, and the same script names (`lint`, `typecheck`, `test`, `test:unit`, `build`).
- Every external version comes from the catalog, checked by `tooling/repo-checks/src/catalog.test.ts`; relative imports all use `.ts`, enforced by a lint rule.
- Every command line exits through `runCommand` (`packages/dev/src/cli.ts:23-41`).

Weaknesses:
- Two ways to type a failed read (`InputProblem` and `{ error: string }`, 7 files with the latter) and two ways to test for one (`isProblem(` 40 times, `"error" in` 10 times in non-test source, and in templates such as `templates/base/apps/core/src/provision.ts:9`).
- Two process runners and a duplicated helper (category 5).
- Messages for the same kind of failure differ in form: `exec` throws a `Problem` "pnpm ... exited with 1" (`packages/dev/src/exec.ts:40-44`), and `set-up.ts` throws a plain `Error` "pnpm install failed in dir" (`packages/create-robkit/src/set-up.ts:11`).
- Coverage targets range from 100 (guard, hono, start) to 51 branches (create-robkit) and 28 branches (test-postgres).

Worth copying from robkit:
- Identical package skeletons, checked by repo tests, so a new package can be made by copying one.

To raise this by one point:
1. Do the `InputProblem` and `isProblem` change from category 3, then add a lint rule in `tooling/eslint` (or a `no-restricted-syntax` selector) that fails on a return type literal `{ error: string }` and on `"error" in`, with a message pointing at `docs/conventions/errors.md`.
2. Route `packages/create-robkit/src/set-up.ts` through `exec`, and make `exec` say what to check ("pnpm install exited with 1 in <dir>. Its output is above; fix what it names and run again.").

## 7. Error handling: 8/10

What they do well:
- Expected failures are values: `Decision`, `SignIn` (`{ outcome: "wrong" }`, `packages/core/src/sessions.ts:54-57`), `claimInstall` returning `{ outcome: "taken" }`, and readers returning `InputProblem`.
- Faults throw with `cause`, enforced by ESLint's `preserve-caught-error` with `requireCatchParameter` and the custom `robkit/no-silent-catch` (`tooling/eslint/index.js:55-59`, `tooling/eslint/no-silent-catch.js`). My probe's empty `catch (e) {}` failed both.
- All 9 binding-less `catch {}` blocks in source carry a comment saying why the drop is right (for example `packages/dev/src/runner.ts:17-19`, "Signal 0 throws only when the group is gone.").
- Faults the caller must tell apart get a class or a tag: `CoreUnreachableError` and `GuardFault.failed` (`"core-key" | "access-rule" | "network"`, `packages/session/src/request-guard.ts:52-65`). The guard answers 503 rather than treating "couldn't check" as "signed out".
- One `app.onError` in core logs the cause and answers a generic 500 (`packages/core/src/app.ts:140`).
- Command lines split fixable from bug: a `Problem` prints alone, anything else prints with its stack and where to report it (`packages/dev/src/cli.ts:23-41`).
- Every outbound request has a timeout, with a table of limits in `docs/conventions/errors.md` and `AbortSignal.timeout` at each site (`packages/session/src/core-access.ts:34`, `packages/create-robkit/src/coolify.ts:183,446`).
- User-facing messages say what to do: "COOLIFY_URL is ... which isn't a web address. Set it to your Coolify's address, such as https://coolify.example.com." (`packages/create-robkit/src/env.ts:46`); "This browser didn't keep the app's cookie ... Allow cookies for this site and try again." (`request-guard.ts:282-285`).

Weaknesses:
- A few thrown messages give no next step: `` `${command} failed in ${dir}` `` (`packages/create-robkit/src/set-up.ts:11`, no cause, no exit code), `` `the install has no ${path}` `` (`packages/create-robkit/src/generate.ts:116`), and `exec`'s `Problem` "... exited with N" (`packages/dev/src/exec.ts:41-43`), which is printed without a stack as if the person could fix it.
- `packages/guard/src/conformance.ts:51-95` and `packages/create-robkit/src/json.ts:9-11` throw plain `Error` for bad data files with no class, so a caller can't tell them from a bug.

Worth copying from robkit:
- `no-silent-catch`: a 101-line rule that fails a `catch` that neither uses its error nor explains why not.
- A typed fault callback (`onUnavailable(fault)`) with a default that logs, instead of swallowing or rethrowing in middleware.

To raise this by one point:
1. In `packages/create-robkit/src/set-up.ts`, reject with a `Problem` that names the exit code and says what to do, and keep spawn errors as `cause`. In `packages/dev/src/exec.ts:40-44`, include the working directory and "its output is above".
2. Give data-file faults a class: add `ConformanceFileError` in `packages/guard/src/conformance.ts` and use `Problem` in `packages/create-robkit/src/json.ts` when the file is the user's (`robkit.json`), so the CLI prints a fix rather than a stack.

## 8. Testing: 8/10

What they do well:
- Tests call the public interface. Core's tests drive the Hono app over HTTP with real Postgres (`packages/core/src/login-code.test.ts` through `test/fresh-app.ts`) and assert on status, JSON and cookie attributes. Session's tests import from `./index.ts` and build real `Request`s (`packages/session/src/request-guard.test.ts:1-50`).
- Almost no mocking: 2 `vi.mock`, 0 `vi.fn`, 1 `toHaveBeenCalled` across 105 test files. Fakes are real servers (`@internal/test-session`'s `fakeCore`).
- One conformance suite, `packages/guard/conformance.json`, that the guard and every adapter pass, so the adapters can't drift.
- Type-level tests in 5 packages, run by `vitest run --typecheck`.
- An end-to-end path: `tooling/e2e` generates installs on both stacks, adds an app with `robkit add`, drives Chromium through each, runs axe, and runs the install's own CI; a production test builds the images and runs over https behind Caddy.
- The lint rules and repo checks are tested too (`tooling/eslint/*.test.js`, `tooling/repo-checks/src/*.test.ts`), including a test that the coverage ratchet fails when a threshold drops.
- Coverage thresholds are the measured floor and can only rise.

Weaknesses:
- The fast gate runs no core or dev test. Neither package defines `test:unit` (`packages/core/package.json`, `packages/dev/package.json`), because their tests start Postgres, so `pnpm check` checks the backend with types and lint only. Even the pure modules' tests (`packages/core/src/password.test.ts`, `client.test.ts`) run only under `globalSetup: ["./src/test/global-setup.ts"]` (`packages/core/vitest.config.ts:5`), which starts Postgres.
- A cold `pnpm check` on Windows failed: 7 create-robkit tests hit the 30s `testTimeout` (`packages/create-robkit/vitest.config.ts:9`) while turbo ran every package at once. The same tests pass alone in 24s. The recent commit "Give repo-checks' tests 30 seconds under load" shows the fix so far has been raising timeouts.
- create-robkit, which writes every install, has 64% statements and 51% branches; dev has 60% and 52%.

Worth copying from robkit:
- A JSON conformance file that the core logic and every adapter run, so a new adapter starts with the full contract.
- Tests that assert whole response bodies and cookie attributes with literal values.

To raise this by one point:
1. Give core and dev a `test:unit` that runs their Docker-free tests: tag Postgres-backed files by folder (for example `src/**/*.db.test.ts`), point `globalSetup` only at those, and add `"test:unit": "vitest run --exclude 'src/**/*.db.test.ts'"` to `packages/core/package.json` and `packages/dev/package.json`. Add a unit test for `packages/core/src/rate-limit.ts`, which has none of its own.
2. Find why create-robkit's slow tests are slow under load (each generates and formats an install with Prettier) and share one generated install per file with `beforeAll`, or cap turbo's concurrency for `test:unit` in `turbo.json`, rather than raising `testTimeout` again.
3. Raise create-robkit's branch coverage by testing `packages/create-robkit/src/coolify.ts`'s planning and wave functions through `deploy` with a fake Coolify `fetch`, and lift the threshold in `packages/create-robkit/vitest.config.ts`.

## 9. Keeping standards up: 9/10

What they do well:
- Four custom ESLint rules, each with tests (`tooling/eslint/layers.js`, `core-schema.js`, `no-silent-catch.js`, `relative-import-extension.js`), plus undescribed or unused suppressions failing lint (`tooling/eslint/index.js:62-69`, tested by `suppressions.test.js`). I confirmed each fires.
- Repo checks that run as tests: package graph and cycles, catalog-only versions and no unused catalog entries, API reports, packed exports pointing at JS, publint, Are the Types Wrong, and every package having coverage thresholds (`tooling/repo-checks/src/`).
- CI (`.github/workflows/ci.yml`) runs `check:all`, then on pull requests checks every commit subject, that no coverage threshold dropped against the base, and that a published package's source change has a changeset. A `gate` job is the one required check and fails on any failed, cancelled or wrongly skipped job.
- Pre-commit runs ESLint fixes and Prettier on staged files (`lint-staged.config.js`); commit-msg runs the same subject checker as CI (`.husky/commit-msg`).
- `CODEOWNERS`, a PR template with a proof section, changesets config scoped to `src/**` minus tests, knip in the gate, `catalogMode: strict`.
- `AGENTS.md` writes each rule next to the check that enforces it ("A new rule goes in with its lint rule, in the same commit.").
- The install itself ships the same machinery: `robkit check`, Husky, lint-staged, and its own CI workflow, which the e2e runs.

Weaknesses:
- README code isn't checked. `packages/dev/README.md:30-42` has drifted from the API and wouldn't compile.
- A written rule disagrees with its check: `CLAUDE.md` says subjects stay "under about 60 characters", and `tooling/repo-checks/src/commit-subject.ts:1` allows 72.
- The `InputProblem` convention is written but not enforced (category 6).
- Whether `gate` is actually required by branch protection can't be seen from the repo.

Worth copying from robkit:
- A coverage ratchet that compares thresholds against the PR's base (`tooling/repo-checks/src/check-coverage-thresholds.ts`), so thresholds only go up.
- A single `gate` job that turns "all jobs passed or were legitimately skipped" into one required check.

To raise this by one point:
1. Add a README-snippet typecheck to `tooling/repo-checks` (see category 2) so every `ts` fence in `packages/*/README.md`, `docs/**/*.md` and `AGENTS.md` compiles against the built packages.
2. Make `CLAUDE.md` and `tooling/repo-checks/src/commit-subject.ts:1` agree (set `maxLength` to 60 or change the doc to 72), and add a test in `commit-subject.test.ts` that reads the number from one shared constant the doc also quotes.
3. Encode the `InputProblem`-only rule as lint (category 6, step 1).

## 10. Nice to work in as a human: 8/10

What they do well:
- `README.md` gives what robkit is and a quickstart; `CONTRIBUTING.md` (212 lines) covers prerequisites, WSL setup step by step, both gates with their times, a worked first change from ticket to PR, and what to do when a test fails.
- `docs/architecture.md` has mermaid diagrams of the install, request flow, token flow and package map, and the guard's decision table; `docs/adr/` has 12 short records, each linking its ticket.
- Every published package has a README with purpose, example, exports and layer rule.
- Comments explain why, not what, throughout: `packages/session/src/request-guard.ts:134-138` ("A client without fetch metadata, such as a server or a link preview, might not, and would bounce for ever."), `knip.jsonc` explaining each ignore, the catalog comment on why TypeScript stays at 6.0.
- `pnpm create-install` makes an install linked to the checkout in one command, and the e2e prints what the browser saw when a journey fails.
- Script names say what they do (`check`, `check:all`, `api:update`, `shadcn-kit`), and the root `package.json` explains the two gates in a `//` field.

Weaknesses:
- On Windows, a newcomer's first `pnpm check` can fail: mine failed cold with 7 timeouts and passed only once turbo had cached 40 of 42 tasks. `pnpm dev`, core's tests and dev's tests need WSL and Docker (`CONTRIBUTING.md:12-34`).
- The spec lives outside the repo, in a Claude Doc (`AGENTS.md`, `CLAUDE.md`), and planning lives in `.scratch/`, so a contributor without that link has only the tickets.
- The PR template's example ticket points into `.scratch/quality-hillclimb/issues/` (`.github/pull_request_template.md:3`), a working folder rather than the build tickets.
- `AGENTS.md` is 200 lines of dense rules in one file; useful, but a newcomer has to read it all to find the one that applies.

Worth copying from robkit:
- CONTRIBUTING's worked first change, from picking a ticket to opening the PR.
- An architecture page whose diagrams use the glossary's words and link each box to its ADR.

To raise this by one point:
1. Make the cold fast gate reliable on Windows (category 8, step 2), and say in `CONTRIBUTING.md`'s "Check your work" table how long a cold run takes there.
2. Export the spec into the repo as `docs/spec.md` (or link only the sections still current from the tickets) so `AGENTS.md` and `CLAUDE.md` point at a file, and change `.github/pull_request_template.md:3` to an example under `.scratch/v0.1-build/issues/`.
3. Split `AGENTS.md`'s per-package sections into the matching `packages/<name>/README.md` "For contributors" sections and keep `AGENTS.md` to the rules and commands, so each rule has one home near its code.

## Top 5 practices to copy

1. The package graph as data, checked by a test that parses every import and finds cycles, agreeing with a layer lint rule whose message names the rule. `tooling/repo-checks/src/package-graph.ts`, `tooling/repo-checks/src/graph-check.ts`, `tooling/eslint/layers.js`.
2. Casts banned outside tests by `no-unsafe-type-assertion`, with a written reader convention returning a typed value or a problem. `tooling/eslint/index.js:37-48`, `packages/session/src/input.ts`, `docs/conventions/input.md`.
3. A pure policy table plus one JSON conformance file that the core logic and every adapter run. `packages/guard/src/guard.ts:50-75`, `packages/guard/conformance.json`.
4. Errors enforced by lint: `preserve-caught-error` with `requireCatchParameter`, and a custom `no-silent-catch` that accepts a dropped error only with a comment saying why. `tooling/eslint/no-silent-catch.js`, `docs/conventions/errors.md`.
5. Per-package API reports and a coverage ratchet against the PR's base, both in CI. `packages/*/api-report.md`, `tooling/repo-checks/src/api-report.ts`, `tooling/repo-checks/src/check-coverage-thresholds.ts`, `.github/workflows/ci.yml`.
