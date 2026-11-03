# 18: The package manager table, with bun

**What to build:** A small adapter table renders everything that differs per package manager: where the catalog lives, the lockfile, install and filter commands, settings, and one Dockerfile per manager. bun is the first entry after pnpm. Choosing bun at init produces an install that installs, runs `dev` and builds.

**Blocked by:** 11, 24, 25

**Status:** ready-for-agent

- [ ] pnpm's generated output is unchanged when the table lands (snapshot)
- [ ] Dockerfiles don't rely on Corepack
- [ ] `turbo prune --docker` followed by a frozen install passes for bun

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished tickets 02 and 09, which were deleted once done:

- The dev runner always calls `pnpm run`. (02)
- init's install step reads a per-manager command table. Add bun's install there. It runs `pnpm install --no-frozen-lockfile`, because pnpm on CI refuses an install with no lockfile. (09)
- The wizard offers whatever `packageManagers` lists, so adding bun there offers it with no wizard change. (09)

Notes from ticket 12:

- **CI and AGENTS.md.** The install's CI workflow lives in the `package-managers/pnpm` layer, because its commands are pnpm's; each manager needs its own. The root `AGENTS.md` in `base` lists pnpm commands; render them from the table.
