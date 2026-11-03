# 20: Dev tool options

**What to build:** Vitest, Playwright and Husky with lint-staged can each be switched on or off at init and work when on. ESLint can be switched off too. The layer check is `robkit check` from ticket 12, so it runs whichever linter was chosen.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] Each tool's on and off states produce a repo whose own CI passes
- [ ] The layer check fails a cross-app import whether or not ESLint was chosen

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished ticket 08, which was deleted once done:

- The hub's and admin's unit tests already ship in the install and run under its `pnpm test`, though Vitest isn't a choice in `robkit.json` yet.

Notes from ticket 12:

- **The layer check needs no ESLint.** `robkit check` reads files with TypeScript's parser, and the `base` layer's `lint` script is `robkit check`. The ESLint layer overrides it with `robkit check && eslint .`. A generator test checks both. The install's CI runs `pnpm run --if-present format:check`, so an install without Prettier skips it.
