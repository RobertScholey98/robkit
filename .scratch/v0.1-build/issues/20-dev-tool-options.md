# 20: Dev tool options

**What to build:** Vitest, Playwright and Husky with lint-staged can each be switched on or off at init and work when on. ESLint can be switched off too. The layer check is `robkit check` from ticket 12, so it runs whichever linter was chosen.

**Blocked by:** 12

**Status:** done

- [x] Each tool's on and off states produce a repo whose own CI passes
- [x] The layer check fails a cross-app import whether or not ESLint was chosen

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished ticket 08, which was deleted once done:

- The hub's and admin's unit tests already ship in the install and run under its `pnpm test`, though Vitest isn't a choice in `robkit.json` yet.

Notes from ticket 12:

- **The layer check needs no ESLint.** `robkit check` reads files with TypeScript's parser, and the `base` layer's `lint` script is `robkit check`. The ESLint layer overrides it with `robkit check && eslint .`. A generator test checks both. The install's CI runs `pnpm run --if-present format:check`, so an install without Prettier skips it.

Notes from building ticket 20:

- **The tools.** Every dev tool in the choice table is ready: ESLint + Prettier, Vitest, Playwright, and Husky + lint-staged. Chosen in the build, awaiting R's review: the default is ESLint + Prettier and Vitest, which keeps the default install's files. Playwright and Husky are opt-in, since one needs Docker in CI and the other changes how commits feel.
- **Vitest leaves out rather than lays down.** Chosen in the build, awaiting R's review: the templates write each test beside the code it covers, in `base`, `ui-kits/none` and Chakra's `packages/ui`. So Vitest has no layer. An install without it drops what its `withoutIt` entry lists: `*.test.ts(x)`, `vitest.config.ts`, the `vitest` dependency and each script that runs it. `robkit add` drops them from a new app the same way. `fakeCore` stays in `packages/core-client`, since it imports no test runner. The root `test` script stays and runs no tasks.
- **Playwright.** `tools/playwright` adds `tooling/e2e`, with two browser tests: the owner sets up the install on the way to the example app, and a guest signs in with the `test` code. `pnpm test:e2e` runs them against the install's own `pnpm dev` on ports 3100 and 54330 and a Compose project of their own, which starts from an empty database and is removed afterwards, so the tests never touch the owner's dev data. `ROBKIT_E2E_PORT` and `ROBKIT_E2E_POSTGRES_PORT` move them. Each package manager's CI workflow runs them, after installing Chromium, only when `tooling/e2e/playwright.config.ts` exists (`hashFiles`), so the workflows stay one file each. The generator now restores a stored `gitignore` in any folder.
- **Husky.** `tools/husky` adds `.husky/pre-commit`, which runs lint-staged, and a `postinstall: husky` script. A probe found pnpm, bun and yarn 4 all run a root `postinstall`, yarn even with `enableScripts: false`, while yarn 4 skips `prepare`. Without a `.git`, as in a Docker build, `husky` prints a note and exits 0. lint-staged runs `robkit check` once per commit, without file names. A tool can now name a layer under `with` that it lays only beside another tool, so with ESLint + Prettier, `tools/husky-eslint-prettier` makes the hook also run `eslint --fix` and `prettier --write` on the staged files.
- **init's order.** init now runs `git init` before installing, so Husky's postinstall finds the repository. Before, a fresh install had no hook until its next install.
- **AGENTS.md.** Each tool names a guide line, and the install's root `AGENTS.md` ends with a Dev tools section of the lines for its tools.
- **Tests.** Generator tests cover each tool's files and scripts on and off. The whole-stack test's Prisma install now has every tool and its Kysely install none, so with the default install each tool's on and off states run their own CI steps. The Prisma install's Playwright tests run on free ports beside its journeys and its CI check, which runs beside the journeys, now takes 30 to 45s, so the whole-stack run time is unchanged. Its pre-commit hook is checked to be set up by init, to refuse a commit that breaks the layer rule, and to format a staged file. The lint check runs on the Kysely install too, which has no ESLint. `test:production` gives its Prisma and Kysely installs every tool, so their images build with Husky's postinstall and no git.

