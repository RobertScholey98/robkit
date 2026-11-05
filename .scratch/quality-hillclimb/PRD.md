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
| 1 | 01 to 05 | pending |
