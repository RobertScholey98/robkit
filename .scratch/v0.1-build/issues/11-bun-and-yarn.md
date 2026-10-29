# 11: bun and yarn

**What to build:** Choosing bun or yarn at init produces an install that installs, runs `dev` and builds, with the catalog, lockfile, commands and one Dockerfile per manager rendered from a small adapter table.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] yarn installs use the node-modules linker, never PnP
- [ ] Dockerfiles don't rely on Corepack
- [ ] `turbo prune --docker` followed by a frozen install passes for each manager

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
