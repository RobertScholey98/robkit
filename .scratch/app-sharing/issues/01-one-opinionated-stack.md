# 01: One opinionated stack

**What to build:** Every install gets the same stack: pnpm, Drizzle, shadcn on Base UI, ESLint with Prettier, Husky and Vitest. Delete the other options and everything that only exists for them: bun, Yarn, Prisma, Kysely, Chakra, shadcn on Radix, the no-kit hub and admin, Playwright, the dev-tool toggles and the UI-kit opt-out. That includes their template layers, choice-table rows, package-manager table entries, tests, e2e installs, production installs and CI. The kit matrix exists to cover combinations of choices, so it goes too, with `tooling/matrix`, `kit-matrix.yml` and the nightly matrix job.

Both stacks stay (TanStack Start, and React with Hono), and more will come. Every install enables every stack, and `robkit add` offers all of them, so an app on any stack fits any install. The catalog covers every stack's dependencies.

Init asks for the install's folder and the example app's stack, and nothing else. Where a layer seam only existed to switch between options (the hub's and admin's `ui.tsx` swap, `withoutIt`, `with`, the package-manager table), flatten it into plain files if that makes the code simpler. Don't keep a seam for an option nobody can pick.

**Blocked by:** none

**Status:** done

- [x] `pnpm create-install` asks only for the folder and the example's stack, and the install runs under `pnpm dev`
- [x] Each install has pnpm, Drizzle, shadcn on Base UI, ESLint with Prettier, Husky and Vitest
- [x] `robkit add` offers both stacks in every install, and an added app on the other stack passes the guest journey
- [x] No template, code path, test or workflow is left for a deleted option
- [x] `AGENTS.md`, `GLOSSARY.md` and the map describe the one stack
- [x] The gate passes: `pnpm turbo run lint typecheck test`, and the production e2e for the one install

**Answered (R, 2026-11-05):** delete the other options outright rather than hiding them. Keep both stacks.

Source: [App sharing PRD](../PRD.md)

## Comments

What the build chose (no question went to R; each is the simplest reading of the ticket):

- Init asks for the folder, then the example app's stack, and nothing else. `--stack <name>` skips the wizard, so the folder must be given with it. The install question is gone: `--install` is a flag only, and the checkout's `pnpm create-install` passes it with `--link`. Without `--install`, the next steps say `git init` before `pnpm install`, because Husky sets its hook up only in a repository.
- `robkit.json` is `{ "exampleStack": "start" }`. robkit's commands still use it to refuse a folder that isn't an install, but nothing reads its contents now.
- `robkit add` offers every ready stack and defaults to Start with flags. The coming-later stacks (Next.js, Express, Go) stay in `src/choices.ts`, which is now a plain list of stacks rather than a choice table.
- The templates are plain folders: `templates/base` is the whole install, hub, admin and `packages/ui` included, and `templates/stacks/<name>` is one app with its Drizzle files and kit files. The `ui.tsx` files stay as the hub's and admin's control modules, but `Root` is gone. `shadcn-kit` takes no arguments and writes `base/packages/ui`.
- The `Generator` type is now `Stack`, and the glossary's "generator" and "layer" ambiguities are resolved.
- The whole-stack test runs two installs, one with each stack's example, and each adds an app on the other stack. The own-CI, lint and pre-commit checks run on the Start install. The production e2e runs the default install in one CI job with no matrix, and its build cache scope is now per app (`scope=<slug>`), so the first CI run after this misses the cache once.
- The production job lost its `Production (default)` name with the matrix; it now shows as `production`. If a branch protection rule names the old check, it needs updating.

Proof: the WSL gate (`pnpm turbo run lint typecheck test`) passed 46 of 46 tasks, with 616 tests passed and 1 skipped. `test:production` passed 9 of 9. `pnpm create-install <dir> --stack start` made and installed an install, `robkit add later --stack react-hono` added a Hono app, and under `pnpm dev` the hub and the added app answered 200, and the example and admin answered 401 to curl, as the guard does for a request that isn't a page load.

For ticket 02 (per-app tokens): the adapters, guard and session code are unchanged here. Every install has both stacks' adapters in its catalog, so a change to the token reaches both `@robkit/hono` and `@robkit/start` in every install.

For app sharing: every install of one robkit version now has byte-identical `packages/ui`, `packages/theme`, `packages/core-client` and catalog, since none depends on a choice. The generator's digest snapshot (`generate.test.ts`, "keeps every file of the default pnpm install") pins it, and the two installs it covers differ only in `apps/example` and `robkit.json`. An app shared between installs can assume the same shadcn components, theme tokens, `callCore` and dependency versions.

Left as it was: init has no `--help`. `pnpm create-install --help` fails with "Unknown option '--help'".
