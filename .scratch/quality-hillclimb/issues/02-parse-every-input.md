# 02: Parse every input at its edge

**What to build:** Every value that enters robkit from outside its own code is parsed from `unknown` once, at the edge, by a reader that returns the typed value or a problem that names the file or variable and the key. HTTP bodies and token claims already work this way (`readBody` and the `read*` rules in `packages/core/src/app.ts`, `packages/session/src/session-token.ts`). Files, environment variables and process arguments don't: `robkit.json` and app manifests are cast (`packages/create-robkit/src/add.ts`, `packages/dev/src/apps.ts`, `packages/create-robkit/src/check.ts`), the Coolify config is half-checked then cast (`packages/create-robkit/src/coolify.ts`), and `PORT` goes through `Number` unchecked (`templates/base/apps/core/src/main.ts`).

Raises rubric categories 3 (type safety at the edges), 6 (consistency) and 2 (public API). See `../research/robkit-round-0.md`, sections 2, 3 and 6, for the specific sites, and `../research/t3code.md` section 3 for the pattern that scored 8 (decode files once, map read and shape failures explicitly).

- One reader pattern, used everywhere: a function from `unknown` to the value or a problem. Keep robkit's hand-written readers (no schema library) unless you find the hand-written approach can't express something, and then ask R first.
- Readers for `robkit.json`, an app's `package.json` and its `robkit` field, the Coolify config, `ROBKIT_APPS`, and every environment variable robkit reads (ports, hosts, `ROBKIT_*`). A malformed file, `null`, the wrong shape, a missing key and an out-of-range port each get a test and a message that says which file or variable, which key, and what to do.
- No unchecked type assertion in non-test source. Turn on `@typescript-eslint/no-unsafe-type-assertion` in `tooling/eslint` and fix every site it finds. `as const` stays. The templates are lint-checked by the install's own config; apply the same rule there.
- A `Slug` brand, made only by the slug reader, carried wherever a slug crosses a package boundary. Keep role names and role ids apart where mixing them would change who gets in.
- `GuardedRule` in `@robkit/session` makes `access` and `app` mutually exclusive in its type.
- Type tests (`*.test-d.ts` run by Vitest's typecheck mode) for the public API of `@robkit/guard`, `@robkit/session`, `@robkit/hono`, `@robkit/start` and `@robkit/react`, including what must not compile.
- `docs/conventions/input.md`: the reader convention in a page, with one example. Ticket 01 links it. List anything `AGENTS.md` should say under this ticket's `## Comments` instead of editing it.

**Blocked by:** none

**Status:** done

- [x] Every file, environment variable and argument robkit reads goes through a reader, and each reader has tests for the bad shapes above
- [x] Each reader's problem names the file or variable, the key, and the fix
- [x] `no-unsafe-type-assertion` is on, and no non-test source needs to disable it
- [x] Slugs cross package boundaries as `Slug`
- [ ] `GuardedRule` can't hold both `access` and `app`, and a type test proves it (obsolete: see Comments)
- [x] Each adapter-facing package has type tests for its public API
- [x] `docs/conventions/input.md` exists
- [x] The gate passes: `pnpm turbo run lint typecheck test`

## Comments

### What changed

- **Readers.** `@robkit/session/input` is a new subpath that holds the shared readers: `readPort`, `readHost`, `readDomain`, `readCoreUrl`, `readAppSlug`, `readDatabaseUrl`, `readServeEnv`, `readDevServerEnv`, `readGuardEnv`, `parseJson`, `readDeclares` and `readDeclaredApp`, plus `Problem`, `isProblem`, `isRecord` and `allProblems`. Session is the home because every package and every template app already depends on it. Each package reads its own settings through these:
  - core: `readCoreConfig`.
  - dev: `readDevConfig`, `readProvisionConfig` and `readAppManifest`.
  - create-robkit: `readChoices` for `robkit.json`, `readCoolifyConfig`, `readCoolify`, `readDatabaseUrlsConfig`, `readAppList` for `--apps`, and `readAffectedApps` for turbo's JSON.
  - Templates: every `serve.ts`, `vite.config.ts`, `server.ts`, `database.ts`, `migrate.ts` and `provision.ts`.
- **Slug.** `Slug` is a brand that only `readSlug` makes. It lives in `@robkit/session/addresses`, next to the slug rule, which moved there from `@robkit/dev`. The platform names `core`, `hub` and `admin` are Slugs without reading. `Slug` is required where a slug decides who gets in or reaches SQL: the guard's `app`, a token's audience, provisioning, `ROBKIT_APPS`, deployments and `robkit add`'s choices. `install().host` and `origin` still take a plain string, because they only build addresses.
- **Role names and role ids.** `DeclaredAccess` (a manifest's rule, by role name) is now `{ kind: "roles"; roleNames }`, so it can't be mixed up with the guard's `AccessRule` (by role id). The JSON key stays `roles`.
- **Casts.** `no-unsafe-type-assertion` is on in `tooling/eslint` and in the install template's `eslint.config.js`, for `.ts` and `.tsx` outside tests. I fixed every site it found. The four private test packages (`e2e`, `test-session`, `test-postgres`, `repo-checks`) turn it off in their own `eslint.config.js`, the same exemption a test file gets. No source file disables it.
- **Type tests.** guard, session, hono, start and react each have a `*.test-d.ts` file, and each one includes `@ts-expect-error` cases. Their `test` script is now `vitest run --typecheck`, and their build leaves `*.test-d.ts` out.
- **Docs.** `docs/conventions/input.md` explains the convention and has one example.

### Choices

- **`GuardedRule` no longer exists.** PR #36 replaced it with `GuardedOptions { app, access?, core }`. There, `app` and `access` are meant to be used together: admin passes `app: "admin"` with an owner rule. So the criterion is obsolete, and I left it unticked. The type tests prove what matters now, which is that `app` must be a `Slug` and that a plain string doesn't compile.
- A reader returns `T | Problem` and never throws, which matches core's HTTP `readBody`. The caller decides what a problem means. Readers that read several variables report every problem at once, a line each.
- `ROBKIT_DATABASES` set to empty now means no databases. Before, it was an error.
- `robkit deploy` reads `COOLIFY_URL` and `COOLIFY_TOKEN` before `coolify.json`, so a missing token is reported first.
- I left `NODE_ENV` alone. Only the admin template reads it, to compare against `"production"`, and any other value means dev.
- I kept the readers hand-written, with no schema library. Nothing needed one.

### Proof

- `pnpm turbo run lint typecheck`: 33 of 33 tasks pass.
- On Windows, `pnpm --filter <pkg> test` passes for guard (50 tests, including type tests), session (219), hono (28), start (29), react (9), create-robkit (153) and test-session (16).
- In WSL, one package at a time: core (20 files, 227 tests), dev (51), test-postgres (6) and repo-checks (6) pass. repo-checks' pack test needs `pnpm turbo run build` first, because the WSL copy has no `dist`. Without the build, it fails the same way on any branch.
- I checked a generated install (start example plus a react-hono `notes` app): `pnpm lint` and `pnpm typecheck` pass, and the rule catches a cast added to the app.
- Each type test file fails when one of its `@ts-expect-error` lines compiles. I checked this once in guard by making a refused rule valid.

### Not verified

- `tooling/e2e`'s tests. I didn't run them, as the brief says. Its only change here is its ESLint config.
- On Windows, repo-checks fails with `spawn pnpm ENOENT` and an empty glob. Both come from the environment, and it passes in WSL.
- The whole gate in one run on the merged round. I ran each package's tests separately.

### For AGENTS.md and CONTRIBUTING (ticket 01)

- Read input from outside through a reader that returns `T | Problem`. See `docs/conventions/input.md`.
- The readers are in `@robkit/session/input`. `readSlug` and the `Slug` brand are in `@robkit/session/addresses`. `slugProblem` is no longer exported by `@robkit/dev`.
- Casts fail lint outside tests. Use a type guard or a reader instead.
- An adapter-facing package keeps a `*.test-d.ts` file with what must not compile, and its `test` script runs `vitest run --typecheck`.

### With ticket 03

Ticket 03 hands `readCoolifyConfig` and `readInstallChoices` to these readers, and it adds a `Problem` class to `@robkit/dev`. That class is an `Error` that `runCommand` prints without a stack. These readers' problems map onto it with no rework:

- A malformed or wrong-shaped `robkit.json` or `coolify.json` already comes back as a problem that names the file and the key. For example: `robkit.json isn't valid JSON (...). Fix its syntax.`, `robkit.json: exampleStack is missing. ...`, and `coolify.json must be a JSON object with project, ...`.
- On this branch, the command code throws each one as `new Error(problem.error)`. There are seven sites, in `robkit.ts`, `add.ts` and `add-wizard.ts`, and all of them have the form `if (isProblem(x)) throw new Error(x.error)`. On the merged round, each becomes `throw new Problem(x.error)`, and `runCommand` prints it as a known problem.
- Both packages export a type named `Problem`: session's is the `{ error }` interface, and dev's is the class. A file that needs both should import session's as a type under another name, such as `type Problem as InputProblem`. If R would rather have one name, renaming session's to `InputProblem` is a mechanical follow-up.
