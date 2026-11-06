# 22: Fast, focused generator tests

**What to build:** create-robkit's tests are fast enough to run often and fail only where something broke. The wizards are tested, and the fast gate typechecks a generated install.

Today:
- create-robkit's `test:unit` takes about 75 seconds, the biggest share of `pnpm check`.
- One large digest snapshot of every template file fails on any template edit.
- `wizard.ts` and `add-wizard.ts` have no tests.
- The install check in the fast gate runs tests and lint but not typecheck.
- `@internal/repo-checks#test:unit` misses turbo's cache on every run, so a warm `pnpm check` takes nearly as long as a cold one.

Raises rubric categories 8 (testing) and 10 (nice to work in as a human). Evidence: `../research/council-r3-opus.md` sections 8 and 10; `../research/council-r3-sonnet.md` section 8; `../research/council-r3-sol.md` sections 8 and 10.

- **Find what makes create-robkit's tests slow,** then fix it. Measure first: spawning the command line, pnpm, Prettier, or generating an install per test. Share installs per file, move spawn-heavy tests to `test` and keep `test:unit` in-process, or whatever the measurement says. Target: create-robkit's `test:unit` under 20 seconds on Windows, apart from the install check. Report before and after.
- **Focused assertions.** Replace the digest snapshot in `src/__snapshots__/` with assertions on what each test cares about: specific files' contents, or that the generated program builds. A template edit should break only the test about that file. Keep one cheap check that every shipped file is accounted for.
- **Wizards.** Test `wizard.ts` and `add-wizard.ts` through an injected prompt, such as a queue of fake `@clack/prompts` answers. Raise create-robkit's thresholds to what CI then measures.
- **Typecheck in the install check.** `src/install-checks.test.ts` typechecks the generated install too. A fixture with a template type error fails it.
- **The turbo cache.** Find why `@internal/repo-checks#test:unit` misses turbo's cache, and fix its `inputs` so a warm `pnpm check` with nothing changed hits the cache. Report warm and cold times.

**Blocked by:** none

**Status:** done

- [x] create-robkit's `test:unit` is under 20 seconds apart from the install check, with before and after times
- [x] No test snapshots every template file's digest
- [x] The wizards have tests through injected prompts
- [x] The install check typechecks, and a template type error fails it
- [x] A warm `pnpm check` with nothing changed hits turbo's cache for repo-checks
- [x] The PR's CI `gate` job passes on GitHub

## Comments

**Where the time went.** Alone on Windows, create-robkit's tests took about 27 seconds: the install check 25, vendor 18 (12 of it one test that builds and packs every robkit package), the robkit command line 16 and init's command line 9. The command-line tests spawn the command, about 0.35 seconds each, one after another. Under `pnpm check` the same task took 79 seconds.

**What I chose.**
- Tests within a file run concurrently (`sequence.concurrent` in `vitest.config.ts`). The spawn-heavy files share nothing but installs they only read.
- The build-and-pack test moves to `src/vendor.pack.test.ts`, in a `pack` Vitest project. `test:unit` runs only the `unit` project, as core's and dev's do, so `pnpm check` skips it and `test` (CI) runs it. The other vendor tests stay in `unit` with their fake checkout.
- `test:unit` no longer measures coverage. Core and dev don't either, and CI measures it through `test`.
- I kept the command-line tests in `test:unit`. Concurrent, they take a few seconds, and they are the only check of what each command prints.
- The digest snapshot and the snapshots of the rendered files are gone. One test per stack checks the install is the base and stack templates copied whole, plus the four files the generator writes, so it fails on a dropped, extra or altered file but not on a template edit. Each rendered file has its own test.
- The wizards take a `Prompts` argument (`src/prompts.ts`), defaulting to clack's. `src/test/fake-prompts.ts` answers from a queue and behaves like clack: a text prompt validates what was typed, asks again while it's refused, and takes its default for nothing typed. I also added in-process tests for `robkit add`'s flags, which only spawned tests reached before.
- The install check runs `pnpm typecheck` beside the tests and lint. A second test in the same install appends a type error to `apps/hub/src/core-api.ts` and expects the check to fail. The two run in order, since the second breaks the install.
- repo-checks missed turbo's cache because its `inputs` glob `$TURBO_ROOT$/tooling/**` takes in its own `coverage/` folder, which each run rewrites. `!$TURBO_ROOT$/**/coverage/**` keeps every package's coverage out, for `test` and `test:unit` both.

**Proof.** Windows 11, 16 threads, Node 24. Other tickets' gates were running on the same machine, so single runs vary a lot. I interleaved the runs below.

| What | Before (65-round-4) | After |
| --- | --- | --- |
| create-robkit's tests without the install check, alone (3 runs, interleaved) | 28.8, 20.0, 18.5 s | 9.2, 8.7, 7.8 s |
| create-robkit's `test:unit` inside a cold `pnpm check` | 79 s | 49 s (the install check now also typechecks) |
| `pnpm check --force` (cold) | 112 s | 76 s |
| `pnpm check` (warm, two runs) | 31, 27 s; 47 of 48 tasks cached | 6.7, 7.3 s; 48 of 48 cached |

- Red first: the wizard tests hung on clack's terminal prompts before the seam. The type-error test failed with "promise resolved instead of rejecting" without `pnpm typecheck` in the check. The completeness test failed on both stacks when I made the generator drop `Dockerfile` and rewrite `turbo.json`.
- CI: the `gate` job passed on https://github.com/RobertScholey98/robkit/actions/runs/42194746071. Its first run failed only on my branch threshold, which I had set from the Windows figure.
- turbo's dry run hashes before and after a repo-checks run differed only in `coverage/*` files.
- Coverage: CI measured 81.9 / 75.9 / 90.7 / 82.7 (Windows: 76.1 branches), from about 74 / 66 / 80 / 74. The thresholds are CI's figures rounded down: 81 / 75 / 90 / 82.

**What I couldn't verify.** Timings on a quiet machine. The install check still takes 25 to 45 seconds and is most of `test:unit`.

**Edits for ticket 25 (docs).**
- `packages/create-robkit/README.md`, "How to change a template", step 4: there is no snapshot to update now. Say to run `pnpm --filter create-robkit test`, and that `generate.test.ts` fails on a template edit only if the generator stops copying the file whole. Step 2's last paragraph: the install check also typechecks.
- `docs/testing.md`, the whole-stack test's last bullet: `install-checks.test.ts` runs the tests, lint and typecheck. The first section: create-robkit's `*.pack.test.ts` runs in a `pack` project, apart from `test:unit`, like core's `db` project.
- `AGENTS.md`, the `test:unit` convention: add create-robkit's `pack` project beside core's and dev's `db` project.
- `CONTRIBUTING.md`, "Check your work": `pnpm check` covers the install's typecheck too; replace the times and drop "A warm run still runs repo-checks' tests, which miss turbo's cache every time."
