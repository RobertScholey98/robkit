# 19: yarn

**What to build:** Choosing yarn at init produces an install that installs, runs `dev` and builds, through the table from ticket 18.

**Blocked by:** 18

**Status:** ready-for-agent

- [ ] yarn installs use the node-modules linker, never PnP
- [ ] The install requires Yarn 4.10 or later, the first version with built-in catalogs
- [ ] `turbo prune --docker` followed by a frozen install passes

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

Notes from ticket 18:

- yarn is one more entry in `packageManagers` in `packages/create-robkit/src/package-managers.ts`, its option in the choice table, and a `package-managers/yarn` layer with its settings, Dockerfile and CI workflow. Follow bun's entry: its catalog lives in `.yarnrc.yml` from Yarn 4.10, and `spell` turns the templates' pnpm commands into yarn's. `yarn <script>` runs a script, but `yarn run <script>` is always safe.
- The dev runner and the provision step already run `yarn run <script>` once the install's `packageManager` says `yarn@…`.
- Pin yarn's version in robkit's catalog, as bun's is, and give the e2e package a way to run it. The whole-stack test could move another install to yarn rather than adding one.
