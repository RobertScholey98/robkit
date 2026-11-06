# 09: Small, honest package APIs

**What to build:** Each package exports what its users import and no more, from entry points named after what they hold, and each name says what the thing is. Today `@robkit/session` exports 58 declarations across five concerns (tokens, the request guard, addresses, input readers and the manifest format), `@robkit/dev`'s root mixes the dev runner's internals with the command-line helpers create-robkit imports, and core leaks Drizzle's type through `Database`.

Raises rubric categories 2 (public API), 1 (module boundaries) and 4 (naming). Evidence: `../research/council-r1-opus.md` sections 1, 2 and 4, `../research/council-r1-sol.md` sections 1, 2 and 4, `../research/council-r1-sonnet.md` sections 2 and 4.

- `@robkit/session/input` keeps the generic readers (`InputProblem`, `isProblem`, `isRecord`, `parseJson`, `allProblems` and the single-variable readers). The manifest format (`readDeclares`, `declaresJson`, `readDeclaredApp`, `DeclaredApp`, `Declares`, `DeclaredAccess`) moves to `@robkit/session/manifest`, and `Declares` becomes `AppDeclaration`. Named config bundles with one consumer (`readServeEnv`, `readDevServerEnv`, `readGuardEnv`) move beside it, or to their consumer, whichever leaves fewer exports.
- `@robkit/dev/cli` holds the command-line helpers (`runCommand`, `reportFaultsAt`, and `Problem`, renamed `CommandProblem` beside `InputProblem`), and `exec`. The root entry shrinks to what installs and create-robkit import; the `robkit-dev` bin imports the runner's parts directly. Fold `provisionDatabase` into `provisionDatabases`. create-robkit's own `files.ts` and `set-up.ts` `run` go, in favour of dev's `isMissing` and `exec`.
- core's `Database` is a named type of its own, so the API report stops printing `PostgresJsDatabase`.
- Renames: core's display types in `sessions.ts` (`Viewer`, `OwnerViewer`, `GuestViewer`) clash with the guard's; call them `Profile`, `OwnerProfile` and `GuestProfile`, and add Profile to `GLOSSARY.md`. `packages/core/src/session-token.ts` becomes `mint-token.ts`. In `deployment.ts`, `Value` and `Deployment` become `DeploymentValue` and `AppDeployment`.
- Update `package-graph.ts`, the API reports, the package READMEs, the templates and `AGENTS.md` with each move; this ticket runs after the first wave, so it owns those files then. Add a changeset.

**Blocked by:** 06, 07, 08, 10, 12

**Status:** done

- [x] session's entries each hold one concern, and `Declares` is `AppDeclaration`
- [x] `@robkit/dev/cli` holds `runCommand`, `CommandProblem`, `reportFaultsAt` and `exec`; the root entry holds only what users import
- [x] create-robkit uses dev's `exec` and `isMissing`; its copies are gone
- [x] `Database` is core's own type
- [x] The renames are done, and the glossary has Profile
- [x] API reports, READMEs and AGENTS match
- [ ] The full gate passes: `pnpm check:all`

## Comments

Built on `54-small-honest-package-apis`, from the head of `53-round-2`.

### What I chose

- **The env bundles.** `readServeEnv`, `readDevServerEnv` and `readGuardEnv` went to a new entry, `@robkit/session/app-env`, not into their consumers. Their consumers are four template apps each, plus every app `robkit add` writes, so moving them would copy each reader into four or more files. Putting them beside the manifest format would have broken "one concern per entry".
- **Session's root** still holds tokens, the request guard and the guard's paths. I read those as one concern, verifying an app's session, and didn't split it further.
- **Names beyond the ticket.** With `Declares` renamed, its reader and writer follow: `readAppDeclaration` and `appDeclarationJson`.
- **`@robkit/dev/cli`** holds `isMissing` as well, since create-robkit imports it from there. Dev's old `cli.ts` is now `run-command.ts`, and `cli.ts` is the entry.
- **`provisionDatabase`** is no longer exported. Core's test setup and the whole-stack test provision core with `provisionDatabases` and a test secret, then build its URL with `databaseUrl` and `databasePassword`, as production does. Dev keeps the function inside the package for `provisionApps` and its own tests.
- **`exec` on Windows.** create-robkit runs on Windows, and `pnpm check` runs its set-up tests there, but dev's `exec` spawned without a shell, which can't start `pnpm.cmd`. On Windows `exec` now runs through the shell with each argument in double quotes, and refuses a part a quote can't protect (`"`, `%`, a line break, a trailing backslash). A plain command name such as `pnpm` stays unquoted: cmd.exe can't find a batch file's own folder when it's started by a quoted name from PATH. On Windows a missing command now exits 1 with the shell's message rather than failing to start, so that one exec test is skipped there.
- **`Database`** is `interface Database extends Connection {}`, where `Connection` is the Drizzle type. The API report prints `Database` and no longer prints `PostgresJsDatabase`. An opaque type would hide Drizzle completely, but every query in core would have to unwrap it. Installs only hand the value back to core, so the interface is enough.
- **Profile.** Only the types were renamed. The `viewer` key in `GET /session`'s JSON stays, because the hub reads it.

### The two gaps from the round-2 integration

- **Unknown options.** `readArgs` (`packages/create-robkit/src/args.ts`) wraps `parseArgs` for both bins. A parse error becomes a `CommandProblem` with what's wrong, then the usage. For an unknown option it says `--help isn't an option.`, because Node's own message talks about positional arguments.
- **`typeof` on readers' results.** I fixed more sites than the two named: the admin template's server and vite config, the stacks' `database.ts`, `migrate.ts` and vite configs, core's `migrate.ts` template, and hono's README. A new repo check, `tooling/repo-checks/src/problem-checks.ts`, fails on `typeof x !== "string"` where `x` holds a `read*(...)` result, in source, templates and docs. `docs/conventions/input.md` says so.

### Proof

- `pnpm check` on Windows passes: format, knip, lint, typecheck and every `test:unit`.
- New tests fail on the old code: the unknown-option tests in `bin.test.ts` and `robkit.test.ts` (4 failed before `readArgs`), `windowsCommandLine` in `exec.test.ts`, and the repo scan in `problem-checks.test.ts` (it found the 10 sites above).
- `pnpm --filter @internal/repo-checks api:update` regenerated the session, dev, core and create-robkit reports.
- create-robkit's branch coverage threshold went from 64 to 65.
- Core's and dev's tests, Docker ones included, pass in WSL: `pnpm --filter @robkit/core --filter @robkit/dev test`, 238 and 75 tests. Dev's coverage rose, so its thresholds went to 73, 78, 80 and 73.

### Not verified

- `pnpm check:all` and `tooling/e2e`, which the brief leaves to the coordinator. The whole-stack test's `core-app.test.ts` now provisions core with `provisionDatabases`; it typechecks but hasn't run.
- The templates' changed imports (`@robkit/session/app-env`, `isProblem`) are covered by the generator's snapshots and the doc-example check, but only a generated install, in e2e, typechecks them.

### For the coordinator and ticket 11

- `packages/create-robkit/src/generate.ts` (ticket 11's) changes in one import: `appDeclarationJson` and `AppDeclaration` from `@robkit/session/manifest`.
- `docs/architecture.md` gains a row for `@robkit/session/manifest`, and its token row names `mint-token.ts`.
- `docs/conventions/input.md` and `errors.md` now name `@robkit/session/app-env`, `@robkit/session/manifest`, `@robkit/dev/cli` and `CommandProblem`.
- Regenerate the API reports after the merge.
