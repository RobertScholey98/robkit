# 07: Docs compile, and each fact has one home

**What to build:** Every TypeScript example in the docs compiles against the current packages, in the gate, so docs can't drift from the API again. Each fact lives in one place: a package's contributor detail in its README, testing detail in a testing guide, and `AGENTS.md` keeps the rules and commands.

All three round-1 reviewers found README examples that no longer compile (`packages/dev/README.md` passes strings where the API takes `Slug`; `packages/session/README.md` does too), `packages/dev/README.md` listing `provisionApps(options)` though it takes `root` too, CONTRIBUTING's worked guard change naming the wrong package for its changeset, and `AGENTS.md` too long for a first read.

Raises rubric categories 10 (nice to work in), 2 (public API) and 9 (keeping standards up). Evidence: `../research/council-r1-opus.md` sections 2, 9 and 10, `../research/council-r1-sol.md` sections 2, 9 and 10, `../research/council-r1-sonnet.md` section 10.

- A repo check that extracts every `ts`/`tsx` fence from `packages/*/README.md`, `docs/**/*.md`, `README.md`, `CONTRIBUTING.md` and `AGENTS.md`, and typechecks it against the built packages. A fence that is deliberately not a whole program (a type signature, a fragment) is marked, for example with a `ts nocheck` info string, and the check says how to mark one. Fix every example it finds.
- Fix the dev README's `provisionApps` row, and CONTRIBUTING's worked example so its changeset names `@robkit/guard`. Point `.github/pull_request_template.md`'s example ticket at a real path.
- Move each per-package section of `AGENTS.md` into a "For contributors" section of that package's README, and the Docker-test, whole-stack and production-test detail into `docs/testing.md`. `AGENTS.md` keeps what a contributor or agent needs first: what robkit is, commands, the layer rule, conventions, and where each doc lives. Keep every fact; check it the way ticket 01 did.
- The commit subject limit is 60 characters in `CLAUDE.md` and CONTRIBUTING but 72 in the check. Make one number the source (`tooling/repo-checks/src/commit-subject.ts`) and add a test that every doc quoting it says the same number. Use 72 unless the history shows 60 holds; say which in Comments.

This ticket owns `AGENTS.md`, `README.md`, `CONTRIBUTING.md` (except the "Check your work" table, which ticket 06 owns), `docs/` and the package READMEs in round 2's first wave. Other tickets list doc changes under their Comments.

**Blocked by:** none

**Status:** done

- [x] A repo check typechecks every TypeScript fence in the docs, and a broken example fails it
- [x] Every example compiles, and the dev README's and CONTRIBUTING's errors are fixed
- [x] `AGENTS.md` keeps rules and commands; package detail is in package READMEs and testing detail in `docs/testing.md`, with no fact lost
- [x] The commit subject limit has one source, and a test keeps the docs in step
- [ ] The full gate passes: `pnpm check:all`

## Comments

**What I chose**

- The check is `tooling/repo-checks/src/doc-examples.ts`, run by `doc-examples.test.ts`, so `pnpm check` and `check:all` both run it. It reads every `ts` and `tsx` fence in `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `docs/**/*.md` and `packages/*/README.md`, and compiles each as its own module with the repo's base compiler options. `@robkit/*` and `create-robkit` resolve to each package's built declarations, through its `publishConfig` exports, so an example sees what an install gets from npm. A fence marked `ts nocheck` is skipped, and each failure says so. It takes about 1.5 seconds.
- Third-party imports in examples (`hono`, `@hono/node-server`, `@tanstack/react-start`) resolve from `tooling/repo-checks`, which now takes them as dev dependencies. knip ignores them there, with a comment saying why.
- `docs/conventions/input.md` and `errors.md` have fragments that don't compile, but tickets 08 and 10 own them this wave. The test lists them in `awaitingTheirOwners` and skips them, and a second test fails once either compiles, so the list empties. The coordinator's step is below.
- The README examples now read the app's slug and core's address with `readGuardEnv`, and dev's with `readProvisionConfig`, as the templates do, rather than passing strings where the API takes a `Slug`.
- The commit subject limit is 72. The history shows 60 didn't hold: 38 of 571 subjects run over it, up to 80. `maxSubjectLength` in `commit-subject.ts` is the source; a test reads every root doc and `docs/**` and fails on a subject length other than it. `CLAUDE.md` and CONTRIBUTING now say "72 characters at most".
- `AGENTS.md` went from 169 lines to 67. The create-robkit, UI kit, hub and admin detail went to create-robkit's README; the app, slug and session detail to the session, dev, core and guard READMEs, each in a "For contributors" section; the Docker, whole-stack and production test detail to `docs/testing.md`. hono, start and react had nothing beyond what their READMEs already said, so they have no such section. The repo-wide facts (exports point at `src`, the tooling list) stay in `AGENTS.md`.
- CONTRIBUTING's "When a test fails" repeated the test detail, so it now keeps "rerun it alone" and links to `docs/testing.md`, which holds the rest. I left "Check your work" alone for ticket 06.
- The PR template's example ticket is now `.scratch/v0.1-build/issues/22-app-slugs-checked-at-start.md`, the same ticket CONTRIBUTING uses for a branch name.
- repo-checks' coverage thresholds rose to one point below today's figures, which Windows and Linux measure the same (statements 81, branches 72, functions 84, lines 83).

**Proof**

- Before the README fixes, the check found 39 problems across the docs, among them `packages/dev/README.md:40: Type 'string[]' is not assignable to type 'readonly Slug[]'` and `packages/session/README.md:15: Type '"notes"' is not assignable to type 'Slug'`. After them it finds none outside the two pending docs.
- A unit test feeds the check an example that assigns `"notes"` to a `Slug` and asserts the whole problem it prints, file and line included.
- The doc-quote test failed first (`CLAUDE.md: 60`, `CONTRIBUTING.md: 60`) and passes now.
- No fact lost: a script split the old `AGENTS.md` into 258 clauses and searched the new `AGENTS.md`, CONTRIBUTING, `docs/testing.md`, `docs/architecture.md` and every package README for each. 27 aren't there word for word; I read each, and all are rewordings (for example "the dev runner tells each app" became "the runner tells each app" inside dev's README, and the package one-liners match each README's opening).
- `pnpm check` on Windows: 42 of 42 tasks pass. `pnpm --filter @internal/repo-checks test`: 75 tests pass on Windows, and in WSL (Ubuntu 22.04, Node 24) with the same coverage, so the raised thresholds hold on Linux.

**Not verified**

- `pnpm check:all` (the coordinator runs it on the merged round).

**For the coordinator, after the merge**

- Mark the fragments in `docs/conventions/input.md` (all three `ts` fences) and `docs/conventions/errors.md` (both) as ```` ```ts nocheck ````, or make them whole programs. Then delete `awaitingTheirOwners` and its test from `tooling/repo-checks/src/doc-examples.test.ts`, and let the main test cover every doc.
- Any doc change another ticket asks for: a `ts` fence in it must compile, or be marked `ts nocheck`. Testing detail goes in `docs/testing.md`, and package detail in that package's README.
- If ticket 06 changes which tests need Docker, CONTRIBUTING's "Run one package's tests" and the first lines of `docs/testing.md` both name the Docker-backed packages.
- If ticket 09 drops exports from `@robkit/dev`, its README's exports table and "For contributors" section name `provisionApps`, `routesFor`, `createProxy`, `readAppManifest` and `runDev`.
