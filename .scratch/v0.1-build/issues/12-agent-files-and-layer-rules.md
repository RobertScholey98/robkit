# 12: Agent files and the layer rules

**What to build:** Every generated install carries a root `AGENTS.md`, and every app its own one written for its stack and the repo's ORM, with a one-line `CLAUDE.md` pointing at it. A small `robkit check` enforces the layer rule below. It is the only implementation, it ships whatever linter was chosen, and the generated `lint` script and CI both run it. The generated repo includes a CI workflow that lints, typechecks, tests and builds its own apps.

**Blocked by:** 08

**Status:** done

**The layer rule in a generated install (built as drafted, chosen in the build, awaiting R's review):**

- An app imports only its own files, `@robkit/*` packages and shared `packages/*` (UI kit, tokens). It never imports another app.
- An app reaches core over HTTP only, never through core's schema or `@robkit/core` internals.
- Handlers take the viewer from their adapter. App code never reads the session cookie or verifies a token itself.

- [x] An agent-style change that breaks each rule fails `robkit check` with a message naming the rule
- [x] The root `AGENTS.md` states the layer rule, and the per-app one explains how to read the viewer, call core and add a migration for that stack
- [x] The generated CI workflow passes on a fresh install

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

- R, 2026-11-01: every robkit rule is enforced as a lint rule as we build. robkit's own repo now checks the layer rule in ESLint, in `tooling/eslint/layers.js`, a table with one row per rule. This ticket says `robkit check` is the only implementation in a generated install. Build it from the same table, or have the ESLint rules call it, so there aren't two copies of the rule.
- Carried over from ticket 08: an install has one root `eslint.config.js` from the eslint-prettier layer. It carries the rule that only `apps/core` imports `@robkit/core`. `robkit check` should replace it.

Notes from building it:

- **The check.** `robkit check` is `checkInstall` in `packages/create-robkit/src/check.ts`, with the rule in `layerRule`, one row per rule, each with the message it prints. It reads every script under each `apps/<slug>` (skipping `node_modules`, `dist`, `build` and dot folders) with TypeScript's parser, so it needs no linter. TypeScript is an optional peer of create-robkit: every install has it, and `npm create robkit` doesn't need it. It prints `file:line:column  rule` per problem and exits 1, or prints nothing.
- **What it checks.** Rule one: a relative import that leaves the app's folder, or an import of another app's package name. Rule two (not core): `@robkit/core` or a relative import into `apps/core`. Postgres already confines an app's role to its own schema, so the check doesn't read SQL. Rule three (not core): the bare `@robkit/session` entry, `jose`, or any string holding the session cookie's name. `@robkit/session/addresses` and `/lapsed` stay open to apps.
- **One copy.** The install's ESLint config no longer has its own `@robkit/core` rule. `lint` is `robkit check` in the `base` layer, and `robkit check && eslint .` with ESLint.
- **Agent files.** The root `AGENTS.md` is in `base`, and a test checks it states each row of `layerRule` word for word. Each stack template has an `AGENTS.md`; the ORM's section, `templates/orms/<orm>/AGENTS.md` named by `appGuide` in the choice table, goes on its end. Each `CLAUDE.md` is `@AGENTS.md`, which Claude Code reads as an import.
- **CI.** `.github/workflows/ci.yml` is in the `package-managers/pnpm` layer: install, `lint`, `format:check` if present, `typecheck`, `test`, `build`. The install gets a root `build` (`turbo run build`); only the hub has a `build` script so far. The whole-stack test runs the workflow's steps, all but the install, on the default install.
