# Codebase quality rubric

Four codebases are being scored on the same 10 categories so they can be compared: Ignite (infinitered/ignite), TanStack Router/Start (TanStack/router), T3 Code (pingdotgg/t3code) and robkit. Score each category out of 10 on an absolute scale shared by all four:

- 5 = a typical, decent open-source TypeScript project.
- 7 = clearly above average; a few real gaps.
- 9 = exemplary; you would copy it.
- 10 = nothing worth improving.

Every score needs evidence: file paths (with line numbers where it matters), commands you ran, and counts where a count tells the story (for example `any` / `as` casts / `@ts-ignore` / `eslint-disable` counts in non-test source, number of packages, largest files by line count, dependency count). Do not score from reputation or from the README's claims; score from what the code does.

## The 10 categories

1. **Module boundaries.** Packages and layers depend in one direction, something (lint rule, build, tsconfig references) enforces it, and modules hide a lot behind a small interface. 10 = you can understand a package from its entry file alone.
2. **Public API design.** Each package exports little, names are obvious, callers can't use it wrong. 10 = you can use the API correctly without reading its source.
3. **Type safety at the edges.** Strict TypeScript, no `any` or casts in core code, external input (env, HTTP, files, DB, CLI args) parsed into types at the boundary. 10 = invalid states don't compile.
4. **Naming and domain language.** One name per concept across code, docs and file paths; names match the domain. 10 = a newcomer guesses the right file name before searching.
5. **Simplicity.** Few layers between a question and its answer, no one-caller wrappers, little dead code, a small dependency list. 10 = you can trace a feature end to end in a few files.
6. **Consistency.** Each concern (config, errors, IO, logging, file layout) is handled one way everywhere. 10 = two features look like the same author wrote them.
7. **Error handling.** Errors are typed or tagged, failures are explicit, messages tell the user what to do next. 10 = no swallowed errors, no bare `throw new Error("failed")`.
8. **Testing.** Tests call the public interface and assert on observable results, run fast, and include an end-to-end path. 10 = a refactor changes no tests, but a behaviour change breaks the right ones.
9. **Keeping standards up.** What mechanically stops the standards slipping: custom lint rules, type-level tests, CI gates and what they run, PR templates, changesets/release tooling, CODEOWNERS, review bots, generators/codemods that produce code in the house style, ratchets/baselines, pre-commit hooks, AGENTS.md/CLAUDE.md rules for AI contributors. Score how much of the standard is enforced by machines rather than by memory. 10 = a contributor cannot merge code that breaks a written rule.
10. **Nice to work in as a human.** READMEs (root and per package), CONTRIBUTING, architecture docs, one-command setup, dev loop speed, folder layout you can navigate, comments that explain why, examples/playgrounds, error messages for contributors, scripts with obvious names. 10 = a new contributor makes a correct change on day one without asking anyone.

## Report format

Write the report as Markdown to the path your task gives you. Keep it under about 700 lines. Use this structure:

```
# <repo> quality report

Commit: <sha>. Scope: <which packages/dirs you read, and what you skipped>.

## Scores
| # | Category | Score | One-line reason |
(all 10 rows)

## Measurements
(the counts and commands you ran, as a table or list)

## 1. Module boundaries — <score>/10
What they do well:
- <practice>, with evidence (path:line)
Weaknesses:
- ...
Worth copying into robkit:
- <one or two concrete practices, phrased so someone could act on them>

... repeat for all 10 ...

## Top 5 practices to copy
(ranked, each with the evidence path)
```

Write plain sentences. No em dashes. Cite paths relative to the repo root.
