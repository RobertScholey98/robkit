# 19: Tests without casts, and more of them without Docker

**What to build:** Tests make branded values the same way the code does, and more behaviour is tested by `pnpm check`, which runs without Docker.

What the round-2 reviewers found:
- Six packages each have their own `src/test/slug.ts`.
- `guard.test.ts` and `request-guard.test.ts` cast strings to brands.
- The generated hub, admin and core-client tests run only inside the whole-stack test.
- The pure logic in core's database modules is tested only through Postgres: access-code generation in `access-codes.ts` and session expiry in `sessions.ts`.
- `listRoles` in `roles.ts` scans every membership row for each role.
- `typeofReadChecks` in `problem-checks.ts` matches text, so an awaited call, an aliased import or a declaration split over lines gets past it.

Raises rubric categories 8 (testing), 5 (simplicity) and 9 (keeping standards up). Evidence: `../research/council-r2-sonnet.md` sections 3, 5 and 8; `../research/council-r2-opus.md` section 8; `../research/council-r2-sol.md` sections 5, 8 and 9.

- **Shared test helpers.** `slug()` and brand builders (`aCodeId()`, `aRoleId()`, `aViewer({ kind, roles })`) live in `tooling/test-session`. Delete the six `slug.ts` copies and every cast to a brand in tests. If the cast rule is off for tests, turn it on for brand casts.
- **Template tests in the fast gate.** A no-Docker task runs the generated hub, admin and core-client unit tests and lint, inside `pnpm check`. Make it a create-robkit `test:unit` case, or a workspace task the scripts check knows. Keep `pnpm check` under its documented time, and say how long it adds.
- **Pure parts of core.** Pull the pure parts of core's database modules into functions with unit tests in `test:unit`. That covers code generation, expiry maths and whatever else needs no database.
- **`listRoles`.** Index membership rows by role id once before mapping, with a database test that has several roles.
- **`typeofReadChecks`.** Rebuild it on the TypeScript AST so it follows imported reader bindings, awaited calls and declarations. Extend `problem-checks.test.ts` with each syntax form.
- **Coverage.** Raise thresholds only to what CI measures.

**Running alongside:** tickets 14 (input package) and 17 (renames) also run this wave. Ticket 17 renames core's `sessions.ts` to `session-store.ts`, so leave the file's name alone and only extract functions from it. Ticket 14 moves the readers; import them from where they are now.

**Blocked by:** 13

**Status:** ready-for-agent

- [x] One `slug()` and brand builders in test-session, and no brand casts in tests
- [x] `pnpm check` runs the generated templates' unit tests and lint without Docker
- [x] Core's pure logic has unit tests in `test:unit`
- [x] `listRoles` indexes memberships once, with a test
- [x] `typeofReadChecks` works on the AST, with a test for each syntax form
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose

- **`slug()` lives in a new package, `@internal/test-addresses`, not test-session.** `Slug` comes only from `@robkit/session`. Session's own tests use test-session, so test-session can't depend on session: the graph check refuses the cycle, and so would turbo. test-addresses depends on session and gives `slug()` to core, dev, create-robkit, hono, start and e2e; their six copies are gone. Session keeps its own `src/test/slug.ts`, since it is the one package below the shared helper. Ticket 14's `CoreOrigin` and `Domain` brands are addresses too, so their test builders fit there.
- **Brand builders.** test-session has `aCodeId()`, `aRoleId()` and `aViewer({ kind, roles })`, which read each id with the guard's reader. Its private `guestViewer` is gone in favour of `aViewer`. The guard's own test can't use test-session (test-session depends on the guard), so it reads its guest's code id with `readCodeId`.
- **The cast rule.** `robkit/no-brand-cast` is a new ESLint rule, on for every TS file, tests included. It refuses `as` and `<T>` casts to a branded type: an intersection with a property keyed by a `unique symbol`, or a union or list of them. A cast to an object that holds a brand, such as `as unknown as AccessRule`, still passes, so a test can feed the guard a malformed rule. The rule found three casts, which the builders replaced.
- **Templates in `pnpm check`.** A create-robkit `test:unit` case (`src/install-checks.test.ts`) makes an install linked to the checkout, runs `pnpm install --prefer-offline --ignore-scripts`, then runs the hub's, admin's and core-client's tests and the install's `pnpm lint` at the same time. A child process removes the folder afterwards, because removing its `node_modules` takes 6 to 8 seconds on Windows. create-robkit's `test` and `test:unit` now take every package's `src` as turbo input, since the install links packages create-robkit doesn't depend on.
- **Core's pure parts.** `session-claims.ts` holds session expiry (`sessionExpiry`), the holder's claims and guard viewer, and when a live session's token renews (`needsFreshToken`). `sessions.ts` keeps its name and calls them. `generateAccessCode` is exported and takes its random pick as an argument. New unit tests cover these, the request readers (`readAccess`, `readNewCode`, `parseAccessCode`, `isUuid`, `readCodeIds`, `readNewRole`, `readCredentials`, `readNewOwner`) and token minting. `readDeclaredApps`'s tests moved out of `apps.db.test.ts`, since they never touched Postgres.
- **`listRoles`.** `roleViews` groups the memberships by role id with `Map.groupBy`, then maps the roles. It has unit tests, and `roles.db.test.ts` lists five roles holding different codes.
- **`typeofReadChecks`.** It parses each file with TypeScript, and each `ts` and `tsx` fence in the docs, `nocheck` ones included. A reader is a call to a `read[A-Z]` name, to an import of one under another name, or to `module.readX`, under any `await`, `!` or parentheses. It follows `const x = …` over several lines and `x = …` after a `let`, and finds `typeof x !== "string"` or `!=`, either way round. Comments and strings no longer trip it. `examplesIn` takes `{ nocheck: true }` for this.

### Proof

- `pnpm check` on Windows, cold (`--force`): 49 and 53 s without the install test, 57, 58 and 59 s with it, so it adds about 8 s and stays inside CONTRIBUTING's 53 to 65 s. Warm: 24 s. The first version took 60 to 74 s; installing with `--ignore-scripts`, running tests and lint together, and removing the folder in the background brought it down.
- Red first: `roleViews`' tests on the old `roles.ts`; 11 of the 14 problem-checks tests on the old regex check; the install test with a core-client test broken (it names the failing test) and with a cast in the hub's source (it names the lint error).
- Core's full suite in WSL with Postgres: 26 files and 317 tests passed, the new `GET /roles` test included.
- CI: pending.

### Not verified

- Coverage thresholds are unchanged until CI measures them.
- `pnpm check:all` and e2e in WSL. CI runs them.

### For ticket 14

- `aCodeId` and `aRoleId` in test-session call `known(readCodeId(...))` as `guestViewer` did. When the guard's readers return `InputProblem`, they need the same change.
- test-addresses imports `readSlug` from `@robkit/session/addresses` and `isProblem` from `@robkit/session/input`. Once `orThrow` exists, `slug()` can be `orThrow(readSlug(name))`, and session's own `src/test/slug.ts` can go.
- `problem-checks.ts` treats any `read[A-Z]` call as a reader. If ticket 14 renames readers off that pattern, the check needs the new names.

### For ticket 17

- I added `session-claims.ts` and `session-claims.test.ts` beside `sessions.ts`, and `sessions.ts` and `routes/context.ts` import from them. `sessionLifetimeSeconds` moved there from `sessions.ts`.

### For ticket 18 (docs)

- `AGENTS.md`: a cast to a branded type fails lint everywhere, tests included (`robkit/no-brand-cast`). Tests build `CodeId`, `RoleId` and `Viewer` with test-session's `aCodeId`, `aRoleId` and `aViewer`, and a `Slug` with `slug` from `@internal/test-addresses`. The tooling list should name `@internal/test-addresses`.
- `CONTRIBUTING.md`: `pnpm check` also makes a new install and runs its hub's, admin's and core-client's tests and its lint. Cold on Windows it took 57 to 59 s here, warm 24 s.
- `docs/testing.md`: the whole-stack test is no longer the only place the install's own unit tests run.
- `packages/core/README.md` (For contributors): `session-claims.ts` holds the session logic that needs no database.
- `tooling/eslint/README.md`: `no-brand-cast`. `tooling/repo-checks/README.md`: `problem-checks.ts` reads the syntax tree.
