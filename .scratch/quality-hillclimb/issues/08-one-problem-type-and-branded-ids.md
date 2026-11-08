# 08: One problem type, and brands for every id

**What to build:** A failed read has one type everywhere, `InputProblem`, checked one way, `isProblem`, and lint refuses the alternatives. Every id that changes who gets in is a brand, made only by its reader. No file in the repo, tooling included, casts parsed JSON.

The round-1 reviewers found `| { error: string }` and `"error" in x` beside `InputProblem` and `isProblem` in core's `owner.ts`, `roles.ts`, `access-codes.ts`, `apps.ts` and `app.ts` (`readBody`), create-robkit's `add.ts`, and session's `readSlug`. Address helpers (`install().host`, `origin`) take any string, so `bad/path` became `http://bad`. Role and code ids are plain strings. Tooling has about 12 `JSON.parse(...) as X` casts that `no-unsafe-type-assertion` doesn't see. The manifest icon reader says "one emoji" but checks only length. The generated core-client's `isRecord` accepts arrays where session's doesn't.

Raises rubric categories 3 (type safety), 6 (consistency) and 4 (naming). Evidence: `../research/council-r1-opus.md` sections 3, 4 and 6, `../research/council-r1-sol.md` sections 2, 3 and 6, `../research/council-r1-sonnet.md` sections 2, 3 and 9.

- Replace every hand-written `{ error: string }` result with `InputProblem` and every `"error" in` check with `isProblem`, including `readSlug`, core's readers and `readBody`, and the templates. Add a lint rule (a `no-restricted-syntax` selector or a `robkit/` rule with tests) that fails on a `{ error: string }` type literal and on `"error" in`, pointing at `docs/conventions/input.md`.
- Ban `as` on `JSON.parse(...)` and `.json()` results everywhere, tests aside, and replace the casts in `tooling/` with readers or a small shared `readJsonFile(path, read)`.
- Address helpers in `@robkit/session/addresses` take a `Slug`. Add a type test that a plain string doesn't compile, and a runtime test for a malformed slug at the edge that reads it. `GuardFault.app` is a `Slug`.
- `RoleId` and `CodeId` brands in `@robkit/guard`, used in `AccessRule` and the viewers, made only by core's readers and `readAccessRule`, with `@ts-expect-error` cases in `guard.test-d.ts`.
- Make the icon reader check what its message says (one emoji grapheme, with `Intl.Segmenter`), or change the message to what it checks. Add adversarial cases.
- Give the template core-client's `isRecord` session's meaning, with parity tests.
- Update `docs/conventions/input.md` for the new lint rules. It is this ticket's to edit. List any other doc change under Comments.

**Blocked by:** none

**Status:** done

- [x] No `{ error: string }` result or `"error" in` check is left, and lint fails on a new one
- [x] No `as` on parsed JSON anywhere outside tests, and lint fails on a new one
- [x] Address helpers and `GuardFault.app` take `Slug`, with type and runtime tests
- [x] `RoleId` and `CodeId` are brands, with type tests
- [x] The icon reader checks what its message says
- [x] core-client's `isRecord` matches session's
- [ ] The full gate passes: `pnpm check:all`

## Comments

### What I chose

- `InputProblem`, `isProblem`, `isRecord` and `allProblems` moved to `packages/session/src/problem.ts`, which imports nothing, so `@robkit/session/addresses` can return an `InputProblem` from `readSlug` and still load in the browser. `@robkit/session/input` re-exports them; it stays the one place to import them from.
- Every `readSlug` caller now checks with `isProblem` too, not `typeof x !== "string"`, so a read is checked one way.
- Lint: two `robkit/` rules with tests, `one-problem-type` (every file) and `no-json-cast` (tests aside). `one-problem-type` fails only on a type literal whose one member is a required `error: string`, so result unions such as `{ ok: false; error: string }` and admin's `{ state: "failed"; error: string }` stay legal. An install's `eslint.config.js` gets the same three checks as `no-restricted-syntax` selectors.
- `no-json-cast` covers `JSON.parse` and `.json()`. The two YAML `parse(...) as` casts in tooling (the catalog and `ownCiSteps`) are fixed by hand; lint doesn't see a YAML cast.
- Tooling: `readJsonFile(path, read)` and `readManifest`/`readNamedManifest` in `tooling/repo-checks/src/manifest.ts` replace repo-checks' six casts. e2e and test-postgres parse strings rather than files, so they got small readers in place (`readLeftovers` in test-postgres's `clean-up.ts`).
- `RoleId` and `CodeId` live in `@robkit/guard` with `readRoleId`, `readCodeId` and `readRoleIds`, which take any string that isn't empty: the guard doesn't know core's id scheme. Besides `readAccessRule` and core's readers, session's token reader makes them too, since a token's claims are input. Core's schema types its id columns with Drizzle's `$type`, as core mints every id it stores. Core keeps its `isUuid` checks, so each route answers as before. The one change: an empty string in `codeIds` is now a 400 rather than "One of those codes doesn't exist."
- `OwnerViewer.id` stays a plain string: the ticket names role and code ids, and an owner id doesn't decide who gets in.
- The icon reader takes one grapheme (`Intl.Segmenter`) that matches `/^\p{RGI_Emoji}$/v`, so flags, keycaps, skin tones and ZWJ families pass, and `"x"`, `"1"`, `"📝📝"`, two flags and a lone joiner don't.
- core-client's `isRecord` now refuses arrays. It keeps its own copy, since importing session's would add a dependency to the install's browser bundle; `packages/create-robkit/src/core-client.test.ts` runs both over the same values.
- The pre-commit hook couldn't commit a change to a base template's code: lint-staged found the install's own `lint-staged.config.js` (which runs `robkit check`) and ESLint the install's own config. The hook now runs the root config alone, which skips the templates (`7e961d4`). Ticket 06 or 07 may want to know.

### Proof

- `pnpm check`: 42 of 42 tasks pass.
- `pnpm turbo run typecheck lint`: 33 of 33 tasks pass.
- `pnpm turbo run test:unit`: every package passes (guard 63, session 244, eslint 73, hono 28, start 29, react 9, test-session 16, repo-checks 81, create-robkit 178).
- In WSL: `@robkit/core` 230 and `@robkit/dev` 55 pass. `@internal/test-postgres`: `clean-up.test.ts` passes; `index.test.ts` failed 2 runs of 4 ("container is unhealthy", "keeps its database in memory"), and fails the same way on `47-round-1` (1 of 2), so it's an existing flake under load.
- `ownCiSteps` run against `templates/base` reads its eight `run` steps.
- The install's `no-restricted-syntax` selectors were checked with robkit's ESLint on 11 snippets, each giving the expected result.

### Not verified

- e2e and `pnpm check:all`: left for the coordinator, per the brief. e2e changed (Slugs passed to the addresses, the JSON readers) and only typechecks and lints here.
- An install's own lint with the new selectors runs only in e2e.

### For the doc owners

- Ticket 07: `AGENTS.md` "Conventions" could say a failed read is `InputProblem` checked with `isProblem`, and that `robkit/one-problem-type` and `robkit/no-json-cast` enforce it. "Apps in an install" could add that `RoleId` and `CodeId` are brands from `@robkit/guard`. `packages/guard/README.md` should list `RoleId`, `CodeId`, `readRoleId`, `readCodeId` and `readRoleIds`; `packages/session/README.md` should say `host` and `origin` take a `Slug` and that `readSlug` returns an `InputProblem`.
- Coverage now sits above the thresholds in session, repo-checks, create-robkit, core, dev and test-postgres, by more than this ticket's tests explain. I raised only `tooling/eslint`'s; the coordinator can ratchet the rest after the merge.
- `robkit add` takes any icon text; only the dev runner's reader refuses a bad one later. Its prompt could validate with the same check.
