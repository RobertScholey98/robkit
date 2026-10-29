# 12: Agent files and the layer rules

**What to build:** Every generated install carries a root `AGENTS.md`, and every app its own one written for its stack and the repo's ORM, with a one-line `CLAUDE.md` pointing at it. A small `robkit check` enforces the layer rule below. It is the only implementation, it ships whatever linter was chosen, and the generated `lint` script and CI both run it. The generated repo includes a CI workflow that lints, typechecks, tests and builds its own apps.

**Blocked by:** 08

**Status:** ready-for-agent

**The layer rule in a generated install (draft, for R to react to):**

- An app imports only its own files, `@robkit/*` packages and shared `packages/*` (UI kit, tokens). It never imports another app.
- An app reaches core over HTTP only, never through core's schema or `@robkit/core` internals.
- Handlers take the viewer from their adapter. App code never reads the session cookie or verifies a token itself.

- [ ] An agent-style change that breaks each rule fails `robkit check` with a message naming the rule
- [ ] The root `AGENTS.md` states the layer rule, and the per-app one explains how to read the viewer, call core and add a migration for that stack
- [ ] The generated CI workflow passes on a fresh install

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
