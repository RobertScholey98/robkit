# 12: Dev tool options

**What to build:** Vitest, Playwright and Husky with lint-staged can each be switched on or off at init and work when on. With ESLint switched off, the layer check still runs through the same rules via a small `robkit check`.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Each tool's on and off states produce a repo whose own CI passes
- [ ] The layer check fails a cross-app import whether or not ESLint was chosen

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
