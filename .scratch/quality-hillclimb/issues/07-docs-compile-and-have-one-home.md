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

**Status:** ready-for-agent

- [ ] A repo check typechecks every TypeScript fence in the docs, and a broken example fails it
- [ ] Every example compiles, and the dev README's and CONTRIBUTING's errors are fixed
- [ ] `AGENTS.md` keeps rules and commands; package detail is in package READMEs and testing detail in `docs/testing.md`, with no fact lost
- [ ] The commit subject limit has one source, and a test keeps the docs in step
- [ ] The full gate passes: `pnpm check:all`
