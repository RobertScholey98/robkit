# 18: The package manager table, with bun

**What to build:** A small adapter table renders everything that differs per package manager: where the catalog lives, the lockfile, install and filter commands, settings, and one Dockerfile per manager. bun is the first entry after pnpm. Choosing bun at init produces an install that installs, runs `dev` and builds.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] pnpm's generated output is unchanged when the table lands (snapshot)
- [ ] Dockerfiles don't rely on Corepack
- [ ] `turbo prune --docker` followed by a frozen install passes for bun

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
