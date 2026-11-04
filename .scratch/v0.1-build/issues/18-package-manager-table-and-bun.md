# 18: The package manager table, with bun

**What to build:** A small adapter table renders everything that differs per package manager: where the catalog lives, the lockfile, install and filter commands, settings, and one Dockerfile per manager. bun is the first entry after pnpm. Choosing bun at init produces an install that installs, runs `dev` and builds.

**Blocked by:** 11, 24, 25

**Status:** done

- [x] pnpm's generated output is unchanged when the table lands (snapshot)
- [x] Dockerfiles don't rely on Corepack
- [x] `turbo prune --docker` followed by a frozen install passes for bun

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished tickets 02 and 09, which were deleted once done:

- The dev runner always calls `pnpm run`. (02)
- init's install step reads a per-manager command table. Add bun's install there. It runs `pnpm install --no-frozen-lockfile`, because pnpm on CI refuses an install with no lockfile. (09)
- The wizard offers whatever `packageManagers` lists, so adding bun there offers it with no wizard change. (09)

Notes from ticket 12:

- **CI and AGENTS.md.** The install's CI workflow lives in the `package-managers/pnpm` layer, because its commands are pnpm's; each manager needs its own. The root `AGENTS.md` in `base` lists pnpm commands; render them from the table.

Notes from building ticket 18:

- **The table.** `packageManagers` in `packages/create-robkit/src/package-managers.ts` has one entry per manager: its settings file, its lockfile, its install and run commands, `writeSettings` and `overridesIn` (the catalog, `builds` and overrides in the manager's own shape), the root `packageManager` it names, and `spell`. The generator, init's install and printed steps, `robkit add`, its printed steps and `robkit vendor` all read it. The pnpm pin, a digest of every file in five pnpm installs, passed unchanged when the table landed.
- **Spelling.** The templates are written for pnpm. As the generator and `robkit add` write files, `spellFor` spells their commands and files for the install's manager, and formats each file it changed. A bun install never names pnpm, and a test checks it. Chosen in the build, awaiting R's review: one set of templates spelled per manager, rather than a placeholder in every file.
- **bun.** `bun@1.4.4` comes from robkit's catalog. The workspaces, catalog, overrides and `trustedDependencies` live in `package.json`. Naming every trusted package means bun's own default list never applies, so only `builds: true` scripts run, as with pnpm's `allowBuilds`. `bunfig.toml` sets `minimumReleaseAge` to a day, as pnpm 11 does. bun has no `catalogMode: strict`, so nothing stops a bun install's manifest from pinning a version outside the catalog.
- **Running scripts.** The dev runner and the provision step run `<manager> run <script>`, with the manager the install's root `packageManager` names (`packageManagerOf` in `@robkit/dev`). bun's own `test` and `build` commands shadow an install's scripts, so a bun install always says `bun run <script>`.
- **Dockerfiles.** Each manager's layer brings its own. bun's installs bun and turbo with npm from the install's `package.json`, then prunes and runs `bun install --frozen-lockfile`. No Dockerfile uses Corepack, and a test checks both.
- **A bug bun found.** Each kit's `packages/ui` stylesheet imported `tailwindcss` without declaring it. pnpm's layout hid that; bun's isolated layout doesn't. The kits now declare it, and a test checks each kit's stylesheet imports only declared packages.
- **Tests.** The whole-stack test's Kysely install now runs on bun: install, dev, `robkit add`, every journey and its own CI workflow. That keeps four installs, so the run time is the same. In `test:production` the Kysely install is on bun too, and builds with bun's Dockerfile from vendored tarballs. The e2e package takes `bun` from the catalog, with its install script allowed, since its binary needs it.
- **Not verified:** the bun workflow's `oven-sh/setup-bun@v2` with `bun-version-file: package.json`. The test runs the workflow's `run` steps, not its actions.
