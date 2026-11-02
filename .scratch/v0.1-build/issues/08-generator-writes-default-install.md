# 08: The generator writes the default install

**What to build:** `npm create robkit` run with flags (no prompts) writes an install on the default answers: pnpm, Drizzle, no UI kit, ESLint + Prettier, both generators. The hand-built tree from tickets 02 to 07 becomes the templates rather than a second copy beside them. The install seeds the roles Family and Friends and the `test` code, and adds the example app from the first enabled generator. `pnpm dev` then lets you sign in with `test` and open the example app.

**Blocked by:** 06, 07

**Status:** done

- [x] The generator merges per-choice template layers in a virtual file system and records every choice in `robkit.json`, including `generators`
- [x] Snapshot tests cover the generated output
- [x] robkit's CI generates the default install and runs the end-to-end journey against it

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from the build, for ticket 09 onwards. R hasn't reviewed the choices marked "chosen in the build" yet.

- **Templates.** The apps from tickets 02 to 07 now live in `packages/create-robkit/templates`, in layers: `base` (core, Compose, turbo, the shared tsconfig), `package-managers/pnpm`, `ui-kits/none` (the hub and admin), `tools/eslint-prettier`, and `stacks/start` and `stacks/react-hono`. robkit's root has no apps and no `pnpm dev`. `pnpm create-install <folder>` writes an install linked to the checkout instead.
- **Merging (chosen in the build).** A later layer's file replaces an earlier one, except `package.json`, which deep-merges, so a layer adds its own scripts and dependencies. There are no AST processors yet. The edits that cross choices are JSON and YAML: the catalog, the root `packageManager`, and the example app's package name.
- **Versions (chosen in the build).** Templates say `catalog:`. The generator writes the install's catalog from robkit's own `pnpm-workspace.yaml`, keeping only what the install uses, with `@robkit/*` at their package versions and `packageManager` from robkit's root. It reads these from the checkout it runs from. Publishing needs a copy shipped in the package, and needs the `@robkit/*` packages built to JS, since Node won't strip types under `node_modules`.
- **Linking (chosen in the build).** `--link` adds pnpm `overrides` from each `@robkit/*` package to `link:<checkout>/packages/<name>`. pnpm refuses `link:` inside a catalog. The adapters' framework imports are type-only, so linked packages don't load a second Hono or Start.
- **The example app.** The first generator's stack lands at `apps/example`, named `@internal/example-app`. Its Vite config reads its host from `ROBKIT_APP`, so a stack template names no slug. Ticket 10 can mount a stack at any slug the same way.
- **Lint (chosen in the build).** An install has one root `eslint.config.js` from the eslint-prettier layer, rather than one per app, so a tool layer never edits every app. It carries the rule that only `apps/core` imports `@robkit/core`, which left robkit's own ESLint along with `apps/`. Ticket 12's `robkit check` should replace it.
- **Tests (chosen in the build).** The hub's and admin's unit tests ship in the install and run under its `pnpm test`, though Vitest isn't a choice in `robkit.json` yet. Ticket 20 makes it one. Core's app test moved into the whole-stack test, because it needs robkit's test Postgres.
- **ORM.** `robkit.json` records `orm: "drizzle"`, but there is no Drizzle layer. Core keeps Drizzle inside `@robkit/core`, and the example apps query Postgres with `postgres` directly. Ticket 13 needs the example apps on Drizzle first, so Prisma has something to replace.
- **Flags.** `--pm`, `--orm`, `--tools`, `--generators` and `--link`. There's no `--ui` yet, since there's no kit. The command writes files only: it doesn't install dependencies or start git, which the wizard asks about in ticket 09.
- **CI.** The workflow didn't change. The whole-stack test makes three installs in temp folders before any suite starts: a Start-first default and a Hono-first one each run the journeys, and a third default runs its own lint, typecheck, test and format check, the layer rule check, and core's app test. The server function journey runs on Start only. In WSL on 16 cores the suite took about two and a half minutes.
- **Installs and `node --watch`.** pnpm hard-links packages from one store, so running `pnpm install` anywhere touches the files under a running core, and `node --watch` restarts it. The suite makes every install up front for this reason. A user running two installs on one machine will see core restart too. It's harmless there, but worth knowing.
- **Tests on Windows.** Same as 05 to 07. The whole suite passes in WSL Ubuntu 22.04, run from an LF archive of the branch.
