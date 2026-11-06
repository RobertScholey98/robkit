# 24: Standards that check themselves

**What to build:** The last rules that live only as prose get checks: the ruleset on `main`, a deadline on every outbound request, and how a new package is set up.

Today:
- `main` has a ruleset ("main requires gate", added 2026-11-06) that requires the `gate` check and a pull request, and blocks force pushes and deletion. Nothing notices if it's removed or loosened.
- `docs/conventions/errors.md` gives a deadline for every outbound request, but nothing checks that a new `fetch` has one.
- Adding a package means hand-writing its `package.json`, configs, README, graph entry and API report.

Raises rubric category 9 (keeping standards up). Evidence: `../research/council-r3-opus.md` section 9; `../research/council-r3-sonnet.md` section 9; `../research/council-r3-sol.md` section 9.

- **Branch rules check.** Add `tooling/repo-checks/src/branch-rules.ts`. It reads `gh api repos/RobertScholey98/robkit/rules/branches/main` (or the rulesets API), and fails unless `main` requires the `gate` status check and a pull request, and blocks force pushes and deletion. Run it in CI's `pull-request` job with `GH_TOKEN`. Test it against recorded API answers, both good and loosened.
- **Deadline check.** Add a repo check that fails on an outbound `fetch` (or `callCore`-style wrapper) in `packages/*/src` and the templates that has no `AbortSignal` deadline, and passes when the caller's signal is combined with one. Give it failing and passing fixtures, document its exceptions, and fix what it finds.
- **`pnpm new:package <name>`.** It writes `package.json` (the scripts the scripts check wants), `vitest.config.ts`, the tsconfigs, a README stub, the package graph entry and an empty API report. A test runs it in a temporary copy and then runs the repo checks on the result.
- List doc edits for ticket 25 under Comments.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] CI fails if `main`'s ruleset stops requiring `gate` or a pull request, tested against recorded answers
- [ ] An outbound fetch without a deadline fails a check, and the repo passes it
- [ ] `pnpm new:package` makes a package that passes the repo checks, with a test
- [ ] The PR's CI `gate` job passes on GitHub
