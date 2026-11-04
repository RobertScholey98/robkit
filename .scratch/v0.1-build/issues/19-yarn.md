# 19: yarn

**What to build:** Choosing yarn at init produces an install that installs, runs `dev` and builds, through the table from ticket 18.

**Blocked by:** 18

**Status:** done

- [x] yarn installs use the node-modules linker, never PnP
- [x] The install requires Yarn 4.10 or later, the first version with built-in catalogs
- [x] `turbo prune --docker` followed by a frozen install passes

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from ticket 18:

- yarn is one more entry in `packageManagers` in `packages/create-robkit/src/package-managers.ts`, its option in the choice table, and a `package-managers/yarn` layer with its settings, Dockerfile and CI workflow. Follow bun's entry: its catalog lives in `.yarnrc.yml` from Yarn 4.10, and `spell` turns the templates' pnpm commands into yarn's. `yarn <script>` runs a script, but `yarn run <script>` is always safe.
- The dev runner and the provision step already run `yarn run <script>` once the install's `packageManager` says `yarn@…`.
- Pin yarn's version in robkit's catalog, as bun's is, and give the e2e package a way to run it. The whole-stack test could move another install to yarn rather than adding one.

Notes from building ticket 19:

- **The table.** yarn is one more entry in `packageManagers`. Its settings span two files: the catalog sits in `.yarnrc.yml`, and the workspaces, `builds` and `--link`'s overrides sit in `package.json` as `dependenciesMeta` and `resolutions`. The adapter now writes settings into the install's files rather than one file's text, a refactor the pnpm pin passed unchanged.
- **Settings.** `.yarnrc.yml` sets `nodeLinker: node-modules`, `npmMinimalAgeGate: 1d` (pnpm 11's and bun's one day), and `enableScripts: false`. With scripts off, `dependenciesMeta.<name>.built: true` turns one back on, as a probe with esbuild showed: only the `builds` the table names run, as with pnpm's `allowBuilds`. The install state goes to `node_modules/.yarn-install-state.gz`, so an install has no `.yarn` folder to ignore. yarn has no `catalogMode: strict`, as bun hasn't.
- **Yarn 4.10 or later.** `packageManager` pins `yarn@4.18.1` from robkit's catalog (`@yarnpkg/cli-dist`). A yarn older than 4.10 can't read the `catalog:` the manifests name.
- **No Corepack.** Chosen in the build, awaiting R's review: the Dockerfile and the CI workflow install `@yarnpkg/cli-dist` with npm at the version `packageManager` names, with `--force` to replace the Yarn 1 that `node:24-alpine` and GitHub's runners ship. No `yarnPath` bundle is committed to the install.
- **Spelling.** Templates say `yarn run <script>`, `yarn <binary>` for `pnpm exec`, `yarn install --immutable` for a frozen install, `.yarnrc.yml` for the catalog and `yarn.lock`. A new install's first install is `yarn install --no-immutable`, since yarn on CI refuses to write a lockfile. `yarn run` has no `--if-present`, so the CI workflow checks for `format:check` in `package.json` before it runs it.
- **Tests.** The whole-stack test's Prisma install now runs on yarn: install, dev, `robkit add`, every journey and its own CI workflow. That keeps four whole-stack installs, so the run time is the same. The e2e package takes yarn from the catalog's `@yarnpkg/cli-dist`.
- **Linked installs.** With `--link`, yarn takes robkit's packages through `portal:`, not `link:`. yarn's `link:` links no bins, so an install had no `robkit` or `robkit-dev`, and the whole-stack test passed anyway because the e2e package's `node_modules/.bin` leaked into the install's `PATH`. A portal links bins but installs the package's own dependencies from the install, so a linked yarn install also links every robkit package its packages need and catalogs their dependencies. A check on a clean `PATH` adds an app, lints, typechecks, tests and builds. yarn warns (YN0072) that portals want `--preserve-symlinks`. Nothing needs it, and a user's install takes the packages from npm and never sees it.
- **Criterion 3, and the production deploy.** turbo 2.11.10 can't prune a yarn lockfile that takes robkit's packages from a path, as `--link` and `robkit vendor` do: yarn ties each path to the workspace that names it (`::locator=…`), and turbo fails with "Unable to find any locator". A user's install takes them from npm, so `tooling/e2e/src/yarn-prune.test.ts` serves the packed packages from a registry on 127.0.0.1 and proxies the rest to npm. turbo prunes each of a yarn install's four apps with `--docker`, and the pruned `yarn install --immutable` passes. `test:production` can't build a yarn install's images until the packages are on npm, so its Prisma install stays on pnpm, and ticket 31 notes adding a yarn install once they are.
