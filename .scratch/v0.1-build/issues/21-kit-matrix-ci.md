# 21: Kit matrix CI

**What to build:** The end-to-end journey already runs on the default install (ticket 08). This ticket runs generated installs across combinations. On each PR, robkit's CI builds a pairwise set that covers every pair of choices at least once, and runs the journey once per stack. A nightly job builds the full matrix of package managers, ORMs, UI options and stacks. None of this ships in a user's install.

**Blocked by:** 13, 14, 16, 17, 19, 20

**Status:** ready-for-agent

- [ ] The pairwise set is computed from the option lists, so adding an option updates it
- [ ] The bun job is required
- [ ] A broken combination fails CI with the combination named

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from ticket 13:

- The whole-stack test makes its installs from `installChoices` in `tooling/e2e/src/install.ts`, and `describeJourneys(name, { roles })` runs the journeys on one. The role journey takes about two minutes and tests only core and the guard, so run it on one install per stack, not on every combination.
- `pnpm test:production` loops over `installs` in `production.test.ts`, about three and a half minutes each. A nightly job can take the full list, and a PR one only the default.

Notes from ticket 14:

- Every ORM is now ready, and the whole-stack test runs four installs: the default, React + Hono first, Prisma and Kysely. The pairwise set can replace the last two. Keep one install where both apps share a non-Drizzle ORM: Kysely's migrator found another app's tables until `migrate` named its schema, and only two apps on one ORM catch that.
- `pnpm test:production` deploys three installs, about three minutes each.
