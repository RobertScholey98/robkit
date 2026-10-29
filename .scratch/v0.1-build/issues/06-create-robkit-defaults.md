# 06: `npm create robkit` on defaults

**What to build:** `npm create robkit` asks the init questions from the CLI flow prototype and, on the default answers (pnpm, Drizzle, no UI kit, ESLint + Prettier, both generators), writes an install equivalent to the hand-built tree from tickets 02 to 05. It generates core's signing key, seeds the roles Family and Friends and the `test` code, and adds the example app from the first enabled generator. `pnpm dev` then lets you sign in with `test` and open the example app.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] The generator merges per-choice template layers in a virtual file system and records every choice in `robkit.json`, including `generators`
- [ ] A `robkit/templates/<stack>` folder in the target repo overrides that stack's template
- [ ] init never asks for a domain
- [ ] The same install can be produced non-interactively with flags
- [ ] Snapshot tests cover the generated output

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
