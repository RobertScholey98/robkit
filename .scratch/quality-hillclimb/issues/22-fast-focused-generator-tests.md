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

**Status:** ready-for-agent

- [ ] create-robkit's `test:unit` is under 20 seconds apart from the install check, with before and after times
- [ ] No test snapshots every template file's digest
- [ ] The wizards have tests through injected prompts
- [ ] The install check typechecks, and a template type error fails it
- [ ] A warm `pnpm check` with nothing changed hits turbo's cache for repo-checks
- [ ] The PR's CI `gate` job passes on GitHub
