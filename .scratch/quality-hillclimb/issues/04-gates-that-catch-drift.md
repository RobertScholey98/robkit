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

**Status:** ready-for-agent

- [ ] `pnpm check` runs without Docker, and `pnpm check:all` runs what CI runs
- [ ] A repo check enforces the declared package graph and rejects cycles
- [ ] `robkit check` covers an install's shared packages
- [ ] knip, publint and attw run in the gate and pass
- [ ] Each published package has an API report, and a check fails on an unreported API change
- [ ] The gate passes: `pnpm turbo run lint typecheck test`
