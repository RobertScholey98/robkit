# What do pnpm, bun and yarn each support for a robkit monorepo?

Type: research
Status: resolved

## Question

The init wizard offers a package manager choice. For each of pnpm, bun and yarn (Berry), find out what it supports today for workspaces, version catalogs, Turborepo, and pruned Docker builds (`turbo prune`). The answer decides which choices init can offer without the kit carrying per-manager special cases.

## Answer

All three can be offered. pnpm, bun and Yarn 4.10+ share the `workspace:*` and `catalog:` syntax, and Turborepo lists all three as stable. The differences are rendered files, not code paths: where the catalog lives, the lockfile, install and filter commands, manager settings, and one Dockerfile per manager.

- pnpm is the default and the only tier-1 choice. bun and Yarn are tier 2, driven by a small adapter table.
- Generate Yarn with `nodeLinker: node-modules`. Don't offer Yarn PnP.
- `turbo prune --docker` is the weak point, worst for bun. CI runs create, install, prune, frozen install and build for each manager, and bun's job is required.
- Don't rely on Corepack in Dockerfiles, because Node 25 no longer ships it.
- Node won't strip types from `.ts` under `node_modules`, so apps are bundled for production.

Detail: [research/02-package-managers.md](../research/02-package-managers.md).
