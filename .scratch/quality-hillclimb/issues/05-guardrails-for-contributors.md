# 05: Guardrails for contributors

**What to build:** The rules in `CLAUDE.md` and `AGENTS.md` that today rely on memory get a machine that enforces them before code merges: commit messages, lint suppressions, formatting before commit, coverage that can only go up, ownership, and what a PR must show.

Raises rubric categories 9 (keeping standards up) and 8 (testing). See `../research/robkit-round-0.md` section 9 and `../research/t3code.md` section 9 (suppression reasons, staged checks, PR template that asks for evidence, a final CI job that checks every job's result).

- Lint suppressions: `reportUnusedDisableDirectives` as an error, and every `eslint-disable` comment must give a reason (`@eslint-community/eslint-plugin-eslint-comments`, `require-description`).
- A pre-commit hook for this repo (Husky and lint-staged, as installs already use) that formats and lints staged files, and a commit-msg hook that checks the subject: at most 72 characters, no trailing period, starts with a capital letter and an imperative verb (reject a first word ending in "ed" or "ing"). CI runs the same subject check on every commit in a PR, skipping merge commits, through one script both use.
- Coverage: Vitest coverage for each package, with each package's thresholds set at today's numbers rounded down, and a check that a threshold in the repo is never lowered. Coverage reports upload as a CI artifact.
- `.github/CODEOWNERS` naming R (`@RobertScholey98`) for everything, and `.github/pull_request_template.md` asking for the ticket, what changed, and the proof (commands run and their result).
- Changesets: each change to a published package carries a changeset, and CI fails a PR that changes `packages/*/src` without one. No publish workflow: robkit doesn't publish to npm yet.
- CI ends in one `gate` job that checks every other job's result, so branch protection needs only one required check.

Add new dev dependencies through the catalog (see `AGENTS.md`'s conventions). List anything `AGENTS.md` or CONTRIBUTING should say under this ticket's `## Comments` instead of editing them.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] An `eslint-disable` without a reason, or one that disables nothing, fails lint
- [ ] The pre-commit hook formats and lints staged files, and the commit-msg hook and CI check subjects with one script
- [ ] Each package has coverage thresholds, and lowering one fails a check
- [ ] CODEOWNERS and a PR template exist
- [ ] A PR that changes a published package's source without a changeset fails CI
- [ ] CI ends in one `gate` job
- [ ] The gate passes: `pnpm turbo run lint typecheck test`
