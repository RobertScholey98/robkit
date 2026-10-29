# 13: Dev tool options

**What to build:** Vitest, Playwright and Husky with lint-staged can each be switched on or off at init and work when on. ESLint can be switched off too. The layer check is `robkit check` from ticket 09, so it runs whichever linter was chosen.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] Each tool's on and off states produce a repo whose own CI passes
- [ ] The layer check fails a cross-app import whether or not ESLint was chosen

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
