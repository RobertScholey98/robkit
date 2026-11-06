# Quality hillclimb

R asked on 2026-11-05 for robkit to beat TanStack Router/Start and T3 Code on every category of a 10-category code-quality rubric. The rubric is `rubric.md`. Four Sol 6.1 explorers scored four codebases with it; their reports are in `research/`.

## Scores at the start

| # | Category | Ignite | TanStack | T3 Code | robkit | robkit needs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Module boundaries | 5 | 7 | 7 | 8 | 8 |
| 2 | Public API design | 7 | 7 | 7 | 7 | 8 |
| 3 | Type safety at the edges | 4 | 6 | 8 | 6 | 9 |
| 4 | Naming and domain language | 7 | 8 | 8 | 8 | 9 |
| 5 | Simplicity | 5 | 6 | 5 | 7 | 7 |
| 6 | Consistency | 6 | 8 | 7 | 8 | 9 |
| 7 | Error handling | 4 | 7 | 8 | 6 | 9 |
| 8 | Testing | 7 | 8 | 8 | 8 | 9 |
| 9 | Keeping standards up | 7 | 8 | 9 | 8 | 10 |
| 10 | Nice to work in as a human | 8 | 8 | 7 | 4 | 9 |
| | Total | 60 | 73 | 74 | 70 | |

"robkit needs" is one more than the higher of TanStack and T3 Code. robkit's round-0 score is for `main` at a4c5109, before PRs #35 and #36.

## How a round works

1. Work the round's tickets, one branch and PR each.
2. Merge the round's branches into a round branch and run the whole gate on it.
3. Council re-scores the round branch with the rubric: three fresh delegates (Claude Opus 5.5, GPT Sol 6.1, Claude Sonnet 5.5), each with no memory of earlier rounds.
4. The next round's tickets come from what council says would raise each score still short.

The hillclimb ends when council's median score beats "robkit needs" in every category.

## Decisions

- The work stacks on PR #36 (per-app tokens), not `main`. #35 deletes about 10,000 lines that the round-0 report scored, so improving `main` would polish code that is about to go. (Claude, 2026-11-05)
- Council has Sonnet 5.5 in place of Gemini, because the Gemini provider is disabled in T3. (R, 2026-11-05)
- A round passes on the median of the three council scores per category, so one outlier doesn't decide it. (Claude, 2026-11-05)
- The project licence is MIT unless R says otherwise. (Claude, 2026-11-05; R to confirm)
- Convention docs that more than one ticket writes live at fixed paths: `docs/conventions/input.md` (ticket 02) and `docs/conventions/errors.md` (ticket 03). Ticket 01 owns `AGENTS.md`, `README.md` and `CONTRIBUTING.md` and links to them. Other tickets list anything those files should say under their `## Comments`.
- Fast and full gates are `pnpm check` (no Docker) and `pnpm check:all` (what CI runs). Ticket 04 builds them; ticket 01 documents them.

## Rounds

| Round | Tickets | Council median |
| --- | --- | --- |
| 1 | 01 to 05 | 78 of 100; passes 1 and 5 |
| 2 | 06 to 12 | 82 of 100; passes 1, 2, 3 and 5 |
| 3 | 13 to 20 | 84 of 100; passes 1, 2, 3, 4, 5 and 7 |
| 4 | 21 to 27 | pending |

### Round 1 council (commit 6b912f9)

Reports: `research/council-r1-*.md`.

| # | Category | Opus 5.5 | Sol 6.1 | Sonnet 5.5 | Median | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Module boundaries | 8 | 8 | 8 | 8 | 8 |
| 2 | Public API design | 7 | 7 | 8 | 7 | 8 |
| 3 | Type safety at the edges | 9 | 8 | 8 | 8 | 9 |
| 4 | Naming and domain language | 7 | 8 | 8 | 8 | 9 |
| 5 | Simplicity | 7 | 7 | 7 | 7 | 7 |
| 6 | Consistency | 7 | 7 | 8 | 7 | 9 |
| 7 | Error handling | 8 | 7 | 8 | 8 | 9 |
| 8 | Testing | 8 | 7 | 8 | 8 | 9 |
| 9 | Keeping standards up | 9 | 8 | 9 | 9 | 10 |
| 10 | Nice to work in as a human | 8 | 7 | 8 | 8 | 9 |

All three found the same top problems: `pnpm check` timed out on a cold Windows run and skips core's and dev's tests, README examples don't compile, `{ error: string }` and `InputProblem` both mean a failed read, and `@robkit/session` and `@robkit/dev` export more than their users need.

Round 2 runs in two waves. Tickets 06, 07, 08, 10 and 12 touch different files and run together. Tickets 09 and 11 reshape the same modules, so they wait for the first wave.

### Round 2 council (commit f2a16c1)

Reports: `research/council-r2-*.md`.

| # | Category | Opus 5.5 | Sol 6.1 | Sonnet 5.5 | Median | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Module boundaries | 8 | 8 | 9 | 8 | 8 |
| 2 | Public API design | 8 | 8 | 8 | 8 | 8 |
| 3 | Type safety at the edges | 8 | 9 | 9 | 9 | 9 |
| 4 | Naming and domain language | 8 | 8 | 9 | 8 | 9 |
| 5 | Simplicity | 7 | 8 | 8 | 8 | 7 |
| 6 | Consistency | 8 | 8 | 9 | 8 | 9 |
| 7 | Error handling | 8 | 8 | 8 | 8 | 9 |
| 8 | Testing | 8 | 8 | 9 | 8 | 9 |
| 9 | Keeping standards up | 7 | 9 | 9 | 9 | 10 |
| 10 | Nice to work in as a human | 8 | 8 | 8 | 8 | 9 |

CI on GitHub failed on every round-2 commit, and on `47-round-1`. test-postgres measures less branch coverage on CI than in WSL, so its threshold fails there. The rounds checked the WSL gate but never CI. From round 3, a branch merges only when its CI `gate` is green. Opus also found that `main` has no branch protection, so nothing requires `gate`; only R can turn that on.

All three reviewers want `@robkit/session` smaller. They want the input readers, the manifest format and the app env readers in a package of their own, and `requestGuard` split into its refresh protocol and its decision.

Round 3 starts with ticket 13, alone, so that CI is green before other branches start. Tickets 14, 17, 18 and 19 then run together. Tickets 15 and 16 change code that 14 moves, so they wait for it.

### Round 3 council (commit 16a7a7b)

Reports: `research/council-r3-*.md`. Ticket 20 fixed a flaky test in dev's runner during the round.

| # | Category | Opus 5.5 | Sol 6.1 | Sonnet 5.5 | Median | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Module boundaries | 8 | 9 | 9 | 9 | 8 |
| 2 | Public API design | 8 | 8 | 8 | 8 | 8 |
| 3 | Type safety at the edges | 9 | 9 | 9 | 9 | 9 |
| 4 | Naming and domain language | 8 | 9 | 9 | 9 | 9 |
| 5 | Simplicity | 7 | 8 | 7 | 7 | 7 |
| 6 | Consistency | 8 | 8 | 9 | 8 | 9 |
| 7 | Error handling | 9 | 8 | 9 | 9 | 9 |
| 8 | Testing | 8 | 8 | 8 | 8 | 9 |
| 9 | Keeping standards up | 8 | 9 | 9 | 9 | 10 |
| 10 | Nice to work in as a human | 8 | 8 | 8 | 8 | 9 |

Consistency, Testing, Standards and Human are still short. API and Simplicity pass with nothing to spare.

What the reviewers agree on:
- The templates' code doesn't meet the repo's own rules. It gets a weaker lint config, the glossary check skips it, and `call-core.ts` has its own reader shape.
- create-robkit's unit tests are slow, its wizards aren't tested, and the admin and hub screens have no component tests.
- After round 3, R approved a ruleset on `main` that requires `gate`. Nothing checks that the ruleset stays.
- `@robkit/session` still holds addresses and `Report`, and core drops the `Domain` brand at `createApp`.

Round 4 runs in two waves. Tickets 21, 22, 24 and 26 run first. Ticket 23 waits for 21, because it tests the template code that 21 changes. Ticket 25 rewrites the docs after the code settles, and ticket 27 moves create-robkit and repo-checks files that 22, 24 and 26 also change.
