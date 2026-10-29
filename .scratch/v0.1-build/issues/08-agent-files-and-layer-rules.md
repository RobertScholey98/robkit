# 08: Agent files and the layer rules

**What to build:** Every generated install carries a root `AGENTS.md`, and every app its own one written for its stack and the repo's ORM, with a one-line `CLAUDE.md` pointing at it. Lint fails when code breaks the layer rule or imports another app. The generated repo includes a CI workflow that lints, typechecks, tests and builds its own apps.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] An agent-style change that imports across apps fails lint with a message naming the rule
- [ ] The per-app `AGENTS.md` explains how to read the viewer, call core and add a migration for that stack
- [ ] The generated CI workflow passes on a fresh install

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
