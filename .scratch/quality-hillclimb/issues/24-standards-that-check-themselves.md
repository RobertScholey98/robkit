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

**Status:** done

- [x] CI fails if `main`'s ruleset stops requiring `gate` or a pull request, tested against recorded answers
- [x] An outbound fetch without a deadline fails a check, and the repo passes it
- [x] `pnpm new:package` makes a package that passes the repo checks, with a test
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**Branch rules.** `tooling/repo-checks/src/branch-rules.ts` reads GitHub's answer for the rules in force on `main` (`rules/branches/main`, which lists only active rules) and fails unless they require a pull request and `gate`, and block force pushes and deletion. CI's `pull-request` job pipes `gh api "repos/$GITHUB_REPOSITORY/rules/branches/main"` into `check-branch-rules.ts`, with `GH_TOKEN` and `shell: bash` so a failing `gh` fails the step. The repo is public, so the job's read-only token can read it. The tests use the answer recorded on 2026-11-06 (`branch-rules.recorded.json`) and loosened copies of it, plus `[]`, which is GitHub's real answer for a branch no ruleset covers. The check doesn't see bypass actors, and CODEOWNERS review isn't required today, so it isn't checked.

**Deadlines.** `tooling/repo-checks/src/deadlines.ts` reads every `fetch` call in `packages/*/src` and the templates, through any object (`api.fetch`, `globalThis.fetch`), tests and `src/test` left out. A call passes when its options' `signal` holds an `AbortSignal.timeout`, inline or through a name declared in the same file, alone or inside `AbortSignal.any`. The caller's signal alone fails. Its exceptions, which fail when unused:
- `packages/session/src/loopback-fetch.ts`: jose's fetch implementation passes on the signal it's given. Its callers set the deadline (jose's 5-second default, `coreAccess`'s `AbortSignal.timeout(5000)`).
- `entry.fetch` in `packages/start/src/guarded.ts` and the Start template's `serve.ts`: Start's server entry, called in-process, not a request robkit sends.

It found one gap: `sessionFetch`. It now combines the caller's signal, from its options or from a `Request`, with a 30-second `AbortSignal.timeout`, headers and body. I chose 30 seconds to match Coolify's per-request limit. A server function that streams for longer than that will be cut off. R may want a different number. That raised react's branch coverage to 91.66%, so its threshold went from 83 to 91, since the ratchet fails anything more than 2 under. Changeset: `session-fetch-deadline.md`, patch.

**`pnpm new:package <name>`.** `tooling/repo-checks/src/new-package.ts` (the command) and `package-scaffold.ts` (the work) make `packages/<name>` as `@robkit/<name>`: `package.json` with build, lint, typecheck, test and test:unit, the two tsconfigs, ESLint and Vitest configs, `src/index.ts` exporting nothing, a README with the sections AGENTS.md asks for, and the API report `api-report.ts` writes for an empty package. It adds the package to `package-graph.js` (via TypeScript's syntax tree, before the first `@internal/` entry) and to the repo checks' devDependencies in both the graph and `package.json`, so turbo builds it before the API report check reads its dist. Every file is Prettier-formatted. The Vitest config sets `passWithNoTests` and thresholds of 100, so the first code must bring its tests. I named the command `new-*` and let `cli-tests.test.ts` and `vitest.config.ts` accept that prefix.

Running it for real showed two tests that listed every package by name: the layer rule's core rows (`graph-check.test.ts`) and the packed packages (`published.test.ts`). Each now states its rule instead: every package but core and the repo checks is kept off core, and every package under `packages/` packs. Both pass on the base's packages.

**Proof.**
- `new-package.test.ts` copies the repo to a temp folder, makes two packages (one in-process, one through the command), then runs the scripts, coverage, catalog, graph (manifests, imports, cycles), glossary, deadline and doc example checks on the copy, compares the API report with what `apiReport` makes from declarations TypeScript emits, and checks Prettier formatting. Breaking the generator (dropping `test:unit`, adding a graph edge the manifest lacks) fails it.
- Real run: `pnpm new:package trial-run`, `pnpm install`, then `pnpm check` passed, 52 of 52 tasks, including publint, Are the Types Wrong and the API report against tsc's real build. I removed the package afterwards.
- `pnpm turbo run test:unit --filter=@internal/repo-checks`: 203 tests pass, coverage 97.04 / 89.16 / 96.96 / 98.21 over thresholds of 96 / 88 / 96 / 98.
- `gh api repos/RobertScholey98/robkit/rules/branches/main | node tooling/repo-checks/src/check-branch-rules.ts` passes against the live ruleset.
- CI: the `gate` job passed on https://github.com/RobertScholey98/robkit/actions/runs/42191661598. Its pull-request job ran the branch rules check with the job's own token and printed "main requires a pull request and the gate check, and blocks force pushes and deletion."

**What I couldn't verify.** The temp-copy test can't build or pack without an install, so it doesn't run publint or the real build; the trial run above covered those once. I didn't run anything in WSL: nothing I changed needs Docker.

**For ticket 21.** `callCore` on this base passes the deadline check: `signal: AbortSignal.timeout(timeoutSeconds * 1000)`. If 21's new code builds the signal another way, keep an `AbortSignal.timeout` inline or in a `const` in the same file. The check doesn't follow a helper function's return value. Any new `fetch` in the templates needs the same.

**For ticket 26.** `deadlines.ts` excuses `packages/session/src/loopback-fetch.ts` by path. If 26 moves that file, move the exception with it. `graph-check.test.ts` no longer lists the packages kept off core, so adding an edge or package there needs no edit to that test.

**Doc edits for ticket 25.**
- `tooling/repo-checks/README.md`, tests table: add `deadlines.test.ts`. Fails on a `fetch` in a package's `src` or the templates whose `signal` holds no `AbortSignal.timeout`, and on an exception nothing needs. Fix: pass `signal: AbortSignal.timeout(ms)`, or `AbortSignal.any([callerSignal, AbortSignal.timeout(ms)])`, inline or in a `const` in the same file. Exceptions: `exceptions` in `src/deadlines.ts`, with why.
- Same README, scripts table: add `check-branch-rules.ts`. Runs in CI's pull-request job. Fails when `main`'s rules stop requiring a pull request or `gate`, or stop blocking force pushes or deletion. Fix: restore the rule in Settings, Rules, Rulesets. Also mention `new-package.ts` (`pnpm new:package`), and that a CI script may be named `new-*` as well as `check-*` or `print-*`.
- `AGENTS.md`, Commands: `pnpm new:package <name>  # makes packages/<name> as @robkit/<name>, with its configs, README, graph entry and API report; pnpm install after`. Conventions: "A new published package gets an entry there and an `api-report.md`" can say `pnpm new:package` writes both. "CI's `gate` job is the one required check" can add that `main`'s ruleset requires it and CI checks the ruleset. "every outbound request has a timeout" can add that a repo check enforces it.
- `docs/conventions/errors.md`, "Outbound requests time out": say `tooling/repo-checks/src/deadlines.ts` fails a `fetch` without one, and add a table row: "A page's `sessionFetch` call to its own app, headers and body | 30 seconds".
- `packages/react/README.md`: the Exports row for `sessionFetch` can say it gives up after 30 seconds with a `TimeoutError`, and that the caller's signal still stops it sooner.
- `CONTRIBUTING.md` line 144 ("It is the one check a pull request needs"): can add that `main`'s ruleset requires it.
