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

- [ ] One `slug()` and brand builders in test-session, and no brand casts in tests
- [ ] `pnpm check` runs the generated templates' unit tests and lint without Docker
- [ ] Core's pure logic has unit tests in `test:unit`
- [ ] `listRoles` indexes memberships once, with a test
- [ ] `typeofReadChecks` works on the AST, with a test for each syntax form
- [ ] The PR's CI `gate` job passes on GitHub
