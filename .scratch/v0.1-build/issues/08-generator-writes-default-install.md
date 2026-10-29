# 08: The generator writes the default install

**What to build:** `npm create robkit` run with flags (no prompts) writes an install on the default answers: pnpm, Drizzle, no UI kit, ESLint + Prettier, both generators. The hand-built tree from tickets 02 to 07 becomes the templates rather than a second copy beside them. The install seeds the roles Family and Friends and the `test` code, and adds the example app from the first enabled generator. `pnpm dev` then lets you sign in with `test` and open the example app.

**Blocked by:** 06, 07

**Status:** ready-for-agent

- [ ] The generator merges per-choice template layers in a virtual file system and records every choice in `robkit.json`, including `generators`
- [ ] Snapshot tests cover the generated output
- [ ] robkit's CI generates the default install and runs the end-to-end journey against it

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
