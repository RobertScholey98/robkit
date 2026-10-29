# 02 — Package managers: pnpm, bun, Yarn Berry

Research date: 2026-10-28. Primary sources only. Every claim links to its source.

## Answer

- **All three can be offered.** Each one supports workspaces, the `workspace:` protocol and a `catalog:` protocol with the same syntax in `package.json`. Turborepo lists all three as **Stable**: pnpm 8+, yarn 1+ (Plug'n'Play included) and bun 1.2+ ([support policy](https://turborepo.dev/docs/support-policy)).
- **The differences fall in five places, and all five are templated files, not code paths.** They are where the catalog lives, the lockfile name, the install, deploy and Docker commands, the `.yarnrc.yml` or `bunfig.toml` settings, and how the manager itself gets into the image.
- **`turbo prune --docker` is the one Docker strategy shared by all three, and it is the weakest point for bun.** It has needed repeated fixes in 2026 before the pruned `bun.lock` would pass `--frozen-lockfile` ([#13317](https://app.semanticdiff.com/gh/vercel/turbo/commit/382e9f57c8ef319e5de76a8c50482fd96b4771cb), [#13310](https://github.com/vercel/turborepo/issues/13310)). Pruning pnpm catalogs also had a bug that was fixed in October 2026 ([#14372](https://github.com/vercel/turborepo/issues/14372)).
- **Recommendation:** make **pnpm** the default and the only tier-1 choice. Offer **bun** and **Yarn Berry** as tier-2 choices, each driven by a small adapter table (below). Yarn should be generated with `nodeLinker: node-modules`. The Dockerfile should be one template per manager, not one generic file with branches. Gate bun behind a smoke test in CI that runs `turbo prune --docker` followed by a frozen install.

## 1. Workspaces and `workspace:`

| | Where workspaces are declared | `workspace:` forms | Rewritten on publish |
|---|---|---|---|
| pnpm | `packages:` in `pnpm-workspace.yaml` | `*`, `^`, `~`, ranges, `workspace:foo@*` aliases, relative paths ([docs](https://pnpm.io/workspaces)) | yes ([docs](https://pnpm.io/workspaces)) |
| bun | `workspaces` in the root `package.json`, with globs and negations ([docs](https://bun.com/docs/pm/workspaces)) | `*`, `^`, `~`, `<path>`, `<name>@<version>` ([docs](https://bun.com/docs/pm/workspaces)) | yes ([docs](https://bun.com/docs/pm/workspaces)) |
| Yarn 4 | `workspaces` array in the root `package.json` ([docs](https://yarnpkg.com/features/workspaces)) | `*`, `^`, `~`, explicit ranges ([docs](https://yarnpkg.com/features/workspaces)) | yes. One difference: `workspace:*` becomes `=3.2.1` ([docs](https://yarnpkg.com/features/workspaces)) |

`"@kit/ui": "workspace:*"` means the same thing in all three. Turborepo's docs still show yarn with `"*"` ([managing dependencies](https://turborepo.dev/docs/crafting-your-repository/managing-dependencies)), but Berry supports `workspace:*`. The kit doesn't publish its internal packages, so the publish differences don't matter. The real difference is that pnpm needs a `pnpm-workspace.yaml` file, while bun and yarn use a `package.json` field.

## 2. Version catalogs

The reference to a catalog entry, `"react": "catalog:"` or `"catalog:<name>"`, looks the same in all three. Where the catalog is defined differs:

- **pnpm.** `catalog:` and `catalogs:` go in `pnpm-workspace.yaml`. They work in dependencies, devDependencies, peerDependencies, optionalDependencies and `overrides`. `catalogMode` (`manual`, `strict` or `prefer`) and `catalogPrune` are available. Defining both `catalog` and `catalogs.default` is an error. All of this is in the [pnpm catalogs docs](https://pnpm.io/catalogs). Catalogs arrived in pnpm 9.5 ([Turborepo docs](https://turborepo.dev/docs/crafting-your-repository/managing-dependencies)). This is the most mature of the three.
- **bun.** `workspaces.catalog` and `workspaces.catalogs` go in the root `package.json`, and a top-level `catalog` key is also accepted. They work in the same four dependency fields and in `overrides`. The lockfile records both the definitions and the resolutions. `bun publish` rewrites `catalog:` references. All of this is in the [bun catalogs docs](https://bun.com/docs/pm/catalogs). In 1.3.0, users reported that catalogs together with isolated installs failed to dedupe compatible ranges ([oven-sh/bun#23615](https://github.com/oven-sh/bun/issues/23615)).
- **Yarn.** `catalog:` and `catalogs:` go in `.yarnrc.yml`. The catalog plugin has been built in since **Yarn 4.10.0**, and publishing rewrites the references ([yarn catalogs](https://yarnpkg.com/features/catalogs), [yarnrc](https://yarnpkg.com/configuration/yarnrc)). The docs only say it works in `dependencies` and `devDependencies` ([yarn catalogs](https://yarnpkg.com/features/catalogs)). Before 2.6.4, `turbo prune` could not resolve Yarn `catalog:` references ([vercel/turborepo#11113](https://github.com/vercel/turborepo/issues/11113)).

**What this means for the kit:** the generator writes the same `catalog:` strings into every `package.json` and renders the catalog map into one of three files. A kit CLI command such as "bump a version" must read and write that file per manager.

## 3. Turborepo and `turbo prune --docker`

`prune --docker` writes `out/json/` (manifests only), `out/full/` (source) and a pruned lockfile ([prune reference](https://turborepo.dev/docs/reference/prune)). For each manager:

- **pnpm** is the best-tested path. In 2026 there were still fixes: catalog snapshots were pruned incorrectly when `catalogPrune` was on, fixed in PR #14376 ([#14372](https://github.com/vercel/turborepo/issues/14372)), and `settings:` were dropped from single-document pnpm lockfiles, fixed in 2.11.8 by #14423. A report that pnpm 12's multi-document lockfiles had the same bug could not be reproduced and was closed ([#14827](https://github.com/vercel/turborepo/issues/14827)). Turborepo 2.11 also reads `devEngines.packageManager` and plans to drop the top-level `packageManager` field in a future major ([2.11 blog](https://turborepo.dev/blog/2-11)).
- **bun.** `bun.lock` pruning was added in #10175 ([commit](https://app.semanticdiff.com/gh/vercel/turbo/commit/4b8cdc4147b31d4770141a42d5de82571db68eb7)). In 2026 the pruned `bun.lock` failed `bun install --frozen-lockfile` ([#13310](https://github.com/vercel/turborepo/issues/13310)). It was patched by removing extraneous entries ([#13317](https://app.semanticdiff.com/gh/vercel/turbo/commit/382e9f57c8ef319e5de76a8c50482fd96b4771cb)). One downstream repo used a workaround of installing from the full root lockfile from July to October 2026 because pruned lockfiles were re-hoisted differently ([zgeoff/vers#413](https://github.com/zgeoff/vers/issues/413)). `--production` has special handling for Bun ([prune reference](https://turborepo.dev/docs/reference/prune)).
- **Yarn Berry** is supported, PnP included ([support policy](https://turborepo.dev/docs/support-policy)). Pruning catalogs was fixed in 2.6.4 ([#11113](https://github.com/vercel/turborepo/issues/11113)). Turborepo's official Docker example uses `yarn install` after the prune step ([Docker guide](https://turborepo.dev/docs/guides/tools/docker)).

## 4. Docker

| | Install one app's deps | Official image | Getting the manager into `node:` images |
|---|---|---|---|
| pnpm | `pnpm fetch` (needs only the lockfile) → `install --offline` → `pnpm deploy --filter=app --prod` ([pnpm Docker](https://pnpm.io/docker)) | `ghcr.io/pnpm/pnpm`, with no Node inside ([pnpm Docker](https://pnpm.io/docker)) | copy the standalone binary from that image ([pnpm Docker](https://pnpm.io/docker)) |
| bun | `turbo prune` → `bun install --frozen-lockfile [--production]` ([bun Docker guide](https://bun.com/guides/ecosystem/docker)). `bun install --filter` also exists ([workspaces](https://bun.com/docs/pm/workspaces)) | `oven/bun` with `debian`, `slim`, `alpine` and `distroless` tags ([install](https://bun.com/docs/installation)) | use `oven/bun` as the base, or copy the binary |
| Yarn 4 | `yarn workspaces focus <app> --production` ([CLI](https://yarnpkg.com/cli/workspaces/focus)) or `turbo prune` | none for Yarn itself | Corepack or a committed `.yarn/releases`. Yarn's own install page uses `npm i -g corepack` ([install](https://yarnpkg.com/getting-started/install)) |

Corepack is **not shipped from Node 25** ([Node docs](https://nodejs.org/download/release/v25.8.0/docs/api/corepack.html)). The reference repo's `RUN corepack enable` therefore works only on Node 24 or earlier. The kit should not rely on Corepack for any manager.

The reference repo does not use `turbo prune` today. `apps/portfolio/Dockerfile` runs `pnpm fetch`, then `pnpm install --offline`, then `pnpm deploy --legacy`. That is the pnpm-native path and it skips prune entirely.

## 5. Other gotchas for a monorepo that ships TypeScript source

- **Layout of `node_modules`.** pnpm is isolated by default. Bun uses **isolated by default for new workspaces** (`configVersion = 1`, from about 1.3.2) and hoisted for older lockfiles ([bun isolated installs](https://bun.com/docs/pm/isolated-installs)). Yarn 4 defaults to **`nodeLinker: pnp`**. It also offers `pnpm` and `node-modules` linkers ([yarnrc](https://yarnpkg.com/configuration/yarnrc)). PnP needs editor SDKs for TypeScript and Prettier ([editor SDKs](https://yarnpkg.com/getting-started/editor-sdks)), so the kit should write `nodeLinker: node-modules`. Yarn's `node-modules` linker hoists, so a package can import something it never declared and the build still passes. The isolated layouts of pnpm and bun catch that.
- **Running TypeScript directly.** Node strips types by default since 22.18 and treats it as stable since 24.12. It **refuses `.ts` files under `node_modules`** ([Node TypeScript](https://nodejs.org/api/typescript.html)). Symlinked workspaces resolve to `packages/*`, so this is fine. Copies made by `pnpm deploy` or injected packages land under `node_modules`, so the kit must bundle the app (as Vite already does) rather than run unbuilt source from a deploy directory. Bun runs `.ts` natively. That is a runtime choice and separate from which package manager the kit uses.
- **Install scripts are blocked by default in all three.** pnpm 11 sets `strictDepBuilds: true` and uses an `allowBuilds` map ([pnpm 11](https://pnpm.io/blog/releases/11.0)). Bun has an allow-list in `trustedDependencies` ([bun lifecycle](https://bun.com/docs/pm/lifecycle)). Yarn sets `enableScripts: false` by default ([yarnrc](https://yarnpkg.com/configuration/yarnrc)). Each manager needs its own allow-list template, for example for esbuild.
- **Release-age gates.** pnpm 11 has `minimumReleaseAge`, defaulting to 1 day ([pnpm 11](https://pnpm.io/blog/releases/11.0)). Yarn has `npmMinimalAgeGate` ([yarnrc](https://yarnpkg.com/configuration/yarnrc)). The reference repo already sets the pnpm one.
- **Churn.** pnpm 12 is a Rust rewrite and is stable, but the `latest` tag still points at 11 ([pnpm 12](https://pnpm.io/blog/releases/12.0)). Yarn 6 is a Rust rewrite in preview. It ships its own version switcher, and Yarn 5 will be the LTS ([Yarn 6](https://v6.yarnpkg.com/concepts/yarn-6)). pnpm 11 requires Node 22 or later ([pnpm 11](https://pnpm.io/blog/releases/11.0)).
- **The `create` commands.** `npm create robkit` resolves to `create-robkit` ([npm init](https://docs.npmjs.com/cli/v11/commands/npm-init)). So do `pnpm create robkit` ([pnpm create](https://pnpm.io/cli/create)), `bun create robkit`, which runs `bunx create-robkit` ([bun create](https://bun.com/docs/runtime/templating/create)), and `yarn create`, which uses `dlx` ([yarn create](https://v6.yarnpkg.com/cli/create/)). One `create-robkit` package covers all four. The wizard can default its choice to whichever manager invoked it, but the cited docs don't document how to detect that, so it needs a test.
- **Windows.** Turborepo publishes Windows x64 and arm64 binaries ([support policy](https://turborepo.dev/docs/support-policy)). Bun needs Windows 10 1809 or later ([install](https://bun.com/docs/installation)). With bun's isolated linker, long store paths can break lifecycle scripts on Windows ([bun isolated installs](https://bun.com/docs/pm/isolated-installs)).

## What `init` can offer without special cases, and what remains

Nothing in app code or the Turborepo config needs to change per manager. `workspace:*` and `catalog:` strings are identical, and `turbo.json` is identical. What remains is a small per-manager adapter:

| Concern | pnpm | bun | Yarn 4 |
|---|---|---|---|
| Workspace list | `pnpm-workspace.yaml` `packages:` | root `package.json` `workspaces.packages` | root `package.json` `workspaces` |
| Catalog file | `pnpm-workspace.yaml` | root `package.json` `workspaces.catalog` | `.yarnrc.yml` (needs Yarn 4.10 or later) |
| Lockfile | `pnpm-lock.yaml` | `bun.lock` | `yarn.lock` |
| Config file | `pnpm-workspace.yaml` settings | `bunfig.toml` (optional) | `.yarnrc.yml` with `nodeLinker: node-modules` |
| Script allow-list | `allowBuilds` | `trustedDependencies` | `enableScripts` / `dependenciesMeta` |
| Frozen install | `pnpm install --frozen-lockfile` | `bun install --frozen-lockfile` | `yarn install --immutable` |
| Run in one workspace | `pnpm --filter X` | `bun run --filter X` | `yarn workspace X` |
| Docker install of one app | `fetch` + `deploy` | `turbo prune` + frozen install | `workspaces focus --production` |
| Manager in the image | standalone binary or ghcr image | `oven/bun` base | committed `.yarn/releases` or Corepack |
| Version pin | `devEngines.packageManager` | same | same |

**Recommendation.** Ship pnpm as the default. It has the most mature catalogs, the best-tested pruning, Docker docs from the pnpm team, and it is what the reference repo already proves. Bun and Yarn can be offered because every difference is a file the generator renders from the table above. Treat them as tier 2: one Dockerfile template per manager, plus a CI matrix job per manager that runs `create`, then install, then `turbo prune --docker`, then a frozen install and a build. For bun, that check is required, given the 2026 regressions in pruning `bun.lock`. Don't offer Yarn PnP. Don't depend on Corepack.
