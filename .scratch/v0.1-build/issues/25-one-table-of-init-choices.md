# 25: One table of init's choices

**What to build:** Each of init's choices (package manager, ORM, UI kit, stacks, dev tools) is described once: its flag, its options, each option's label, which options are ready and which are "coming later", and the template layer each option adds. The flag parser, the usage text, the wizard and the generator all read that table. Adding an option, as tickets 13 to 20 do, becomes one edit to the table plus the option's template layer.

**Blocked by:** 24

**Status:** ready-for-agent

- [ ] The usage text is built from the table, and a test checks it lists every ready option
- [ ] The wizard's labels and "coming later" options come from the table
- [ ] The generator picks each choice's template layer from the table, the UI kit included, rather than building folder paths in its own code
- [ ] Every install the existing tests generate is unchanged, and the generator's snapshot passes

Source: the architecture review of 2026-11-03 (see the map)
