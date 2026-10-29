# 19: yarn

**What to build:** Choosing yarn at init produces an install that installs, runs `dev` and builds, through the table from ticket 18.

**Blocked by:** 18

**Status:** ready-for-agent

- [ ] yarn installs use the node-modules linker, never PnP
- [ ] The install requires Yarn 4.10 or later, the first version with built-in catalogs
- [ ] `turbo prune --docker` followed by a frozen install passes

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
