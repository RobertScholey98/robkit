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

**Status:** done

- [x] An `eslint-disable` without a reason, or one that disables nothing, fails lint
- [x] The pre-commit hook formats and lints staged files, and the commit-msg hook and CI check subjects with one script
- [x] Each package has coverage thresholds, and lowering one fails a check
- [x] CODEOWNERS and a PR template exist
- [x] A PR that changes a published package's source without a changeset fails CI
- [x] CI ends in one `gate` job
- [ ] The gate passes: `pnpm turbo run lint typecheck test`

## Comments

The work is on branch `46-guardrails-for-contributors`. The last criterion is unticked: lint and typecheck pass, and every package but e2e passes its tests with its thresholds, but I didn't run e2e (see "Not verified").

### What I chose, and why

- **Suppressions.** The shared ESLint config adds `@eslint-community/eslint-plugin-eslint-comments`'s recommended rules plus `require-description`, and sets `reportUnusedDisableDirectives: "error"`. A suppression gives its reason after `--`. The repo had no `eslint-disable` outside the templates, so nothing needed fixing.
- **Hooks.** `pnpm install` runs `husky` (`postinstall: husky || true`, as in installs). `.husky/pre-commit` runs lint-staged. The root `lint-staged.config.js` runs `eslint --fix` on staged code under `packages/` and `tooling/`, and `prettier --write --ignore-unknown` on every staged file. ESLint 10 finds each file's config from its folder, so each file gets its own package's rules. Files outside packages get Prettier only, because there's no root ESLint config. `.husky/commit-msg` runs `node tooling/repo-checks/src/check-commit-subjects.ts "$1"`. CI runs the same script with `--range <base>..HEAD`, which skips merge commits.
- **Subject rule.** A subject is at most 72 characters, has no trailing period, starts with a capital letter, and its first word doesn't end in "ed" or "ing". A short list of real imperatives that end that way (Embed, Feed, Need, Bring, String and a few more) is allowed. `fixup!` commits fail, which seems right when R reviews commit by commit. All 421 non-merge commits on `41-quality-plan` pass.
- **Coverage.** Each package with tests, e2e aside, runs `vitest run --coverage` with `@vitest/coverage-v8`, added to the catalog. The thresholds sit in the package's `vitest.config` as a literal `thresholds: { statements, branches, functions, lines }`. Coverage counts `src/**` without the `src/test/**` helpers, or `*.js` for `tooling/eslint`. Each threshold is today's number rounded down, taking Linux's number where it's lower: create-robkit's branch coverage is 52.00% on Windows and 51.76% on Linux, so its threshold is 51. Two checks keep the thresholds. A repo-checks test fails if a package with tests doesn't measure coverage or sets no thresholds. In CI, `check-coverage-thresholds.ts <base>` fails if a threshold drops or disappears, or a config goes while its package stays. CI uploads every `coverage/` folder as the `coverage` artifact.
- **e2e has no threshold.** The brief said not to run its tests. Coverage would also measure little there, because its tests drive other processes.
- **Changesets.** `@changesets/cli` is set up in `.changeset/config.json`. Its `changedFilePatterns` counts `src/**` but not tests, `src/test/**` or snapshots, so a test-only change needs no changeset. CI runs the tool's own `pnpm changeset status --since=<base>` rather than a script of mine. One limit: it passes a PR that has any changeset, even one that names a different package. A per-package check would need a script, and I didn't think that was worth it before robkit publishes. There's no version or publish workflow.
- **Gate.** `ci.yml` has three jobs. `check` is as before, plus the coverage upload. `pull-request` runs the subject, threshold and changeset checks, on pull requests only. `gate` runs `if: always()` and fails when another job failed or was cancelled, or was skipped on a pull request. `production.yml` is a separate workflow and stays out of the gate.

### Coverage measured

Statements / branches / functions / lines, in %:

| Package | Measured | Thresholds |
| --- | --- | --- |
| @robkit/core (WSL) | 95.48 / 95.31 / 90.54 / 96.42 | 95 / 95 / 90 / 96 |
| create-robkit | 64.34 / 51.76 (Linux) / 74.07 / 65.01 | 64 / 51 / 74 / 65 |
| @robkit/dev (WSL) | 60.35 / 52.5 / 76.59 / 60.39 | 60 / 52 / 76 / 60 |
| @robkit/guard | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| @robkit/hono | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| @robkit/react | 100 / 83.33 / 100 / 100 | 100 / 83 / 100 / 100 |
| @robkit/session | 94.65 / 92 / 96.36 / 96.94 | 94 / 92 / 96 / 96 |
| @robkit/start | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| @internal/eslint-config | 95.65 / 91.78 / 93.54 / 96.29 | 95 / 91 / 93 / 96 |
| @internal/repo-checks (WSL) | 65.41 / 58.97 / 72.41 / 66.37 | 65 / 58 / 72 / 66 |
| @internal/test-postgres (WSL) | 45.55 / 28 / 53.84 / 46.83 | 45 / 28 / 53 / 46 |
| @internal/test-session | 100 / 92.5 / 100 / 100 | 100 / 92 / 100 / 100 |

The packages measured on Windows gave the same numbers in WSL, apart from create-robkit's branches. repo-checks' two CLI scripts show 0% because their tests run them as child processes. dev's statements are 0.35 points above the threshold. If timing ever pushes them below it, fix the flaky test; don't lower the threshold.

### Proof that each check fails on a violation

- **Lint.** `tooling/eslint/suppressions.test.js` lints a disable comment with no reason and one that disables nothing. Both tests failed before the config change and pass after it.
- **Pre-commit.** I staged `const unused = 1` in `packages/guard/src`, and the commit failed with `@typescript-eslint/no-unused-vars`. I staged an unformatted JSON file, and the hook rewrote it in Prettier's style and added a missing semicolon to a staged `.ts` file. The hook also caught a real unused variable in one of my own commits.
- **commit-msg.** `git commit -m "probe the hook."` failed with "ends with a period" and "starts with a capital letter". `check-commit-subjects.test.ts` covers a message file, a range, and skipping a merge commit, in a throwaway repo. `node tooling/repo-checks/src/check-commit-subjects.ts --range 41-quality-plan..HEAD` exits 0 on this branch.
- **Thresholds.** Raising react's branch threshold to 84 failed `pnpm --filter @robkit/react test` with "Coverage for branches (83.33%) does not meet global threshold (84%)". Lowering core's statements threshold to 94 made `check-coverage-thresholds.ts HEAD` fail with "packages/core/vitest.config.ts lowers the statements threshold from 95 to 94." Against `41-quality-plan` it exits 0. Its test covers a lowered, a dropped and a removed threshold, and a deleted package, in a throwaway repo.
- **Changeset.** I committed a change to `packages/hono/src/index.ts` with no changeset, and `pnpm changeset status --since=41-quality-plan` exited 1 ("Some packages have been changed but no changesets were found"). A change to only a test file and a private package passed.
- **Gate.** Actions can't run locally. The PR's own CI run is the first real test of the `pull-request` and `gate` jobs.

Other commands run: `pnpm turbo run lint typecheck` (33 tasks pass) and `pnpm format:check`, on Windows. Every package but e2e passed its tests with coverage in WSL. guard, hono, react, session, start, eslint-config, test-session and create-robkit also passed on Windows. In WSL I ran one package at a time.

### Not verified

- e2e's tests weren't run, as the brief says. This ticket doesn't touch e2e's code.
- On Windows, two repo-checks tests fail, and they fail on the base too: `catalog.test.ts` (glob returns backslash paths) and `published.test.ts` (`spawn pnpm` needs `pnpm.cmd`). Both pass in WSL.

### For R

- **Branch protection.** Make `gate` the only required check on `main`, and on the hillclimb branches if you protect them. I haven't changed any GitHub settings.
- **Round-1 merge.** Tickets 02 and 03 probably change `packages/*/src`. Once this ticket is merged, a PR that carries those changes needs a changeset or CI fails. Run `pnpm changeset` and pick `patch` for each package it touches.
- **Husky in worktrees.** `husky` sets `core.hooksPath=.husky/_` in the repo's shared `.git/config`, so every worktree reads it. A worktree whose branch has no `.husky/` runs no hooks.

### What `AGENTS.md` and CONTRIBUTING should say (ticket 01 owns them)

- Every `eslint-disable` gives its reason after `--`, and lint fails on one that disables nothing.
- `pnpm install` sets up the git hooks. The pre-commit hook runs ESLint's fixes and Prettier on staged files. The commit-msg hook checks the subject: an imperative verb, a capital letter, at most 72 characters and no trailing period. CI checks every commit in a PR the same way, with `tooling/repo-checks/src/check-commit-subjects.ts`.
- `pnpm --filter <package> test` measures coverage and fails below the thresholds in the package's `vitest.config`. When coverage rises, raise the thresholds. CI fails a PR that lowers one. A new package with tests needs thresholds, and a repo-checks test enforces that. e2e has none.
- A change to a published package's `src`, tests aside, needs a changeset. Run `pnpm changeset`.
- CI's `gate` job is the one required check. A PR fills in `.github/pull_request_template.md`: the ticket, what changed, and the proof.
