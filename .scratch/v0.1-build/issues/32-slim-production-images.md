# 32: Slim production images

**What to build:** Each app's image holds its whole pruned workspace, dev dependencies included, at about 500 MB. After this ticket an image holds only what the app needs at runtime: its built output, its production dependencies and its migrate step. Core's image also keeps the provision step's dependencies.

**Blocked by:** 11

**Status:** done

- [x] Each app's runtime image carries no dev dependency
- [ ] Every image is at least half the size it was after ticket 11. The hub and admin are, in every install. Core and the example apps aren't; see Comments and ticket 35.
- [x] The production e2e passes

Source: the build of ticket 11 (2026-11-03)

## Comments

**What changed.** Each package manager's Dockerfile has a `production` stage after the build. It deletes every `node_modules` and `.turbo`, installs only the app's production dependencies, and drops `vendor/`: `pnpm install --prod --filter-prod "@internal/<slug>-app..."`, `bun install --production --filter "@internal/<slug>-app"`, or `yarn workspaces focus --production "@internal/<slug>-app"`. Scoping the install to the app matters: otherwise every workspace package in the pruned tree gets its own dependencies, and the hub's image carried `packages/ui`'s. The runtime stage copies a node:24-alpine with npm, Yarn, Corepack and Node's headers deleted onto `scratch`, 33 MB less, since deleting them in a later layer wouldn't shrink the image.

**Decisions, chosen in the build, awaiting R's review:**

- An app's `dependencies` are what its server and `start` script import. What only its build uses, everything Vite bundles included, is a dev dependency. So the hub's and admin's React, theme, `core-client`, `@robkit/session` and UI kit moved to `devDependencies`. The install's `AGENTS.md` says so under Production. The stacks keep theirs: Start's server build imports them at runtime.
- Husky's postinstall is `husky || true`, as Husky's docs suggest, because a production install has no Husky to run.

**The proof.** `test:production` runs `tooling/e2e/src/extraneous-packages.js` in every image it builds. On node alone, it walks the production dependencies, optional dependencies and peers from the app and the install's root, and fails on any installed package they don't reach. It finds 103 to 168 in each of ticket 11's images (ESLint, TypeScript, Vitest, turbo, Prettier, drizzle-kit, Husky) and none in the new ones. yarn's install can't deploy yet (ticket 31), so `yarn-prune.test.ts` runs yarn's production install on each pruned app and checks that TypeScript is gone and Hono stays.

**Sizes**, in MB, of the images of the three installs `test:production` deploys. "Unpacked" is `du -sx /` in the image. "Docker" is what `docker images` reports; with Docker Desktop's containerd store it counts more than the unpacked files, and it's the figure behind ticket 11's "about 500 MB".

| Install | App | Unpacked before | Unpacked after | Share | Docker before | Docker after |
| --- | --- | --- | --- | --- | --- | --- |
| default (pnpm, Drizzle) | core | 306 | 165 | 54% | 417 | 231 |
| | hub | 368 | 147 | 40% | 509 | 211 |
| | admin | 369 | 148 | 40% | 510 | 212 |
| | example (Start) | 446 | 280 | 63% | 602 | 382 |
| Prisma (pnpm, Chakra) | core | 630 | 494 | 78% | 850 | 670 |
| | hub | 419 | 147 | 35% | 562 | 212 |
| | admin | 421 | 148 | 35% | 564 | 213 |
| | example (Start) | 777 | 627 | 81% | 1030 | 835 |
| Kysely on bun (Base UI) | core | 304 | 165 | 54% | 415 | 231 |
| | hub | 502 | 147 | 29% | 660 | 211 |
| | admin | 504 | 148 | 29% | 662 | 212 |
| | example (Start) | 529 | 389 | 74% | 691 | 505 |

**Why core and the examples don't halve.** What's left is what they run on:

- Node itself is 127 MB of every image, and the trimmed base is about 140 MB. Core's own files and dependencies are 23 MB, so core lands at 54%.
- A Start app's server build imports `@tanstack/react-start`, whose dependencies include Vite's toolchain: rolldown, esbuild, lightningcss, Babel and Prettier, about 60 MB.
- A Prisma app runs `prisma migrate deploy` as it starts, so the Prisma CLI, its engines and Studio's dependencies stay, about 250 MB.
- In a pnpm install with Prisma, core's `drizzle-orm` resolves its optional peers (`@prisma/client`, `prisma`, `pg`, `mysql2`, PGlite) to the Prisma app's packages, and pnpm keeps that one variant, so core's image carries Prisma too. `dedupePeerDependents: false` and `resolvePeersFromWorkspaceRoot: false` don't change it, even from a fresh lockfile.

Ticket 35 holds what could cut these further.
