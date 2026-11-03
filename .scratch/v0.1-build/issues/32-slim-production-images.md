# 32: Slim production images

**What to build:** Each app's image holds its whole pruned workspace, dev dependencies included, at about 500 MB. After this ticket an image holds only what the app needs at runtime: its built output, its production dependencies and its migrate step. Core's image also keeps the provision step's dependencies.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] Each app's runtime image carries no dev dependency
- [ ] Every image is at least half the size it was after ticket 11
- [ ] The production e2e passes

Source: the build of ticket 11 (2026-11-03)
