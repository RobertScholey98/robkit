# 21: Kit matrix CI

**What to build:** The end-to-end journey already runs on the default install (ticket 08). This ticket runs generated installs across combinations. On each PR, robkit's CI builds a pairwise set that covers every pair of choices at least once, and runs the journey once per stack. A nightly job builds the full matrix of package managers, ORMs, UI options and stacks. None of this ships in a user's install.

**Blocked by:** 13, 14, 16, 17, 19, 20

**Status:** done

- [x] The pairwise set is computed from the option lists, so adding an option updates it
- [x] The bun job is required
- [x] A broken combination fails CI with the combination named

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from ticket 13:

- The whole-stack test makes its installs from `installChoices` in `tooling/e2e/src/install.ts`, and `describeJourneys(name, { roles })` runs the journeys on one. The role journey takes about two minutes and tests only core and the guard, so run it on one install per stack, not on every combination.
- `pnpm test:production` loops over `installs` in `production.test.ts`, about three and a half minutes each. A nightly job can take the full list, and a PR one only the default.

Notes from ticket 14:

- Every ORM is now ready, and the whole-stack test runs four installs: the default, React + Hono first, Prisma and Kysely. The pairwise set can replace the last two. Keep one install where both apps share a non-Drizzle ORM: Kysely's migrator found another app's tables until `migrate` named its schema, and only two apps on one ORM catch that.
- `pnpm test:production` deploys three installs, about three minutes each.

Notes from ticket 18:

- bun is ready. The whole-stack test's Kysely install runs on bun, and so does the Kysely install in `test:production`. The package manager is one more dimension of the pairwise set: the generator's pnpm pin, in `generate.test.ts`, covers five pnpm installs file by file.
- A bun install's dev stack, CI steps and Docker build all need bun. In CI it comes from the e2e package's cataloged `bun`, so robkit's own workflow needs no setup step for it.

Notes from ticket 19:

- yarn is ready, so every package manager is. The whole-stack test runs pnpm on the default and React + Hono installs, yarn on Prisma and bun on Kysely. `test:production` deploys pnpm and bun installs only: a yarn install deploys once the packages are on npm (ticket 31), and `yarn-prune.test.ts` checks its prune against a local registry meanwhile. The pairwise set can pair managers with ORMs and kits more freely than that.
- Run each install's checks on a clean `PATH`. A linked yarn install once lacked the `robkit` and `robkit-dev` bins, since yarn's `link:` links none, yet passed, because the e2e package's own `node_modules/.bin` leaked into its scripts. `portal:` fixed it. The matrix should run installs from a shell that can't see robkit's bins.
- yarn comes from the e2e package's cataloged `@yarnpkg/cli-dist`, so robkit's own workflow needs no setup step for it. A generated yarn install's workflow installs yarn with `npm install --global --force`, which the install-checks test skips, as it skips every install step.

Notes from ticket 20:

- The tools are one more dimension of the pairwise set. Keep one install with every tool and one with none, since Playwright's CI steps and Husky's hook are only exercised in an install that has them.
- The install-checks test reads a step's `if` only in the `hashFiles(<path>) != ''` form, honours `working-directory`, and skips every install step, including `playwright install --with-deps`, which needs root. Robkit's own Playwright installs the same Chromium, since `@playwright/test` is cataloged at `playwright`'s version.

Notes from ticket 34:

- Every job that runs journeys on a Linux runner needs CI's `COMPOSE_FILE`, which puts each test Postgres on the host's network. Without it, any compose project starting or stopping beside a journey fails that page's in-flight requests with `ERR_NETWORK_CHANGED`. A new job must keep the job-level `env` in `ci.yml`, and anything new that starts containers during journeys must avoid new networks too.
- A failed journey prints what its browser saw and what the dev runner said, so read that before rerunning.
- One CI job runs the gate in about 8 to 9 minutes on `ubuntu-latest`. Five of them ran in parallel without trouble, so splitting the pairwise set across a job matrix is cheap.

Built (chosen in the build, awaiting R's review):

- **The sets.** `@internal/matrix` reads init's choice table. A choice that takes one option is one dimension, the stacks are one (which comes first, the example's stack), and each dev tool is an on-or-off dimension. The pull request set is a greedy pairwise set: 14 installs today, against a floor of 12, starting with one install with every tool and one with none. The nightly set is the 72 combinations of package manager, ORM, UI option and first stack, with tools picked so it still holds every pair. A test adds a fourth package manager to the table and checks both sets grow to cover it, and that a "coming later" option changes nothing.
- **A combination** is named by its init flags, such as `--pm bun --orm kysely --ui-kit chakra --generators react-hono,start --tools none`, and that name is its GitHub job's name. `test:combination` makes the install from those flags, adds an app on its second stack with its UI kit, and runs the install's own CI steps (lint, typecheck, test, build, and its Playwright tests when it has Playwright) on a `PATH` that can't see any `node_modules/.bin`. A failing step prints its stdout and stderr.
- **Required.** No job or step continues on error and fail-fast is off, so bun's and yarn's combinations fail CI like pnpm's. An `Every combination` job fails when any combination does; it's the one check to require if `main` gets branch protection, since the combinations' job names change with the table. `main` has no protection today, so nothing is enforced on merge yet. That's R's setting to make.
- **Journeys.** The plan (13-kit-testing) runs one browser journey per stack, not per combination. The whole-stack test already runs them, once per stack and once per kit, so the matrix runs none.
- **Proof.** On PR #30, all 14 combinations passed, each in 1 to 3.5 minutes. The nightly set, run once on the PR through a temporary commit (`workflow_dispatch` needs the file on `main`), passed 72 of 72 in 8 minutes. A temporary type error in the Chakra kit failed the Chakra combination with its flags, the step and the error, and left a no-kit one passing.
- **Not covered by the matrix:** prune and frozen install per manager. Production covers pnpm and bun, and `yarn-prune.test.ts` covers yarn.
