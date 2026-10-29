# 09: The init wizard

**What to build:** `npm create robkit` with no flags asks the init questions from the CLI flow prototype: project folder, package manager, ORM, the shared UI kit (y/n, then which), which generators `robkit add` offers, dev tools, and install plus git. Options that later tickets add show as disabled until they land. It ends with next steps and the equivalent non-interactive command.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] init never asks for a domain or the owner's login; the owner claims the install on first run (ticket 03)
- [ ] The wizard's answers and the matching flags produce the same install, byte for byte
- [ ] The printed non-interactive command reproduces the run

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
