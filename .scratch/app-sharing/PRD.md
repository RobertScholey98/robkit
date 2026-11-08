# App sharing

## Problem

robkit is for self-hosting a single-login suite of small apps for yourself, family and friends. People will build novel apps, games and tools in their installs. Today an app can't leave the install it was made in: it leans on install-wide choices (package manager, ORM, UI kit, catalog) and on workspace code outside its folder, and every app's server sees a session token that works on every other app, admin included.

## Goal

Sharing an app is as painless as `npm create robkit`. Like Coolify's one-click services, but the thing shared is a robkit app: its code, its schema and an optional seed.

R's acceptance test (2026-11-05):

1. Create a fresh install from the latest local robkit, as easily as `npm create robkit`.
2. Install into it an app that lives in its own repo, outside any install.
3. `robkit add` a new app, change its frontend and its database, then share it.
4. Create a second fresh install and install that shared app into it. (User A shares, user B imports.)

## Decisions (R, 2026-11-05)

- **One opinionated stack.** pnpm, Drizzle, shadcn on Base UI, ESLint with Prettier, Husky, Vitest. bun, Yarn, Prisma, Kysely, Chakra, shadcn on Radix, no kit, Playwright and the tool toggles are deleted. Every install of one robkit version has the same stack, so an app from one install fits another.
- **Stacks stay plural.** TanStack Start and React with Hono both stay, and more will come. Sharing doesn't care which stack an app is on.
- **Shared code.** R's idea: map an app's imports, and copy any code it uses from outside its folder into a `shared/` folder at the app's root.
- **Database.** A shared app carries its migrations and an optional seed file its author writes. Never a data dump.
- **Trust.** Each app gets its own token, with the app as audience, on its own subdomain. An imported app's server can't act as its viewer anywhere else.
- **Two approaches, built side by side** on separate worktrees, for R to try and pick one: an export bundle (ticket 03) and git app repos (ticket 04).

## Tickets

1. [One opinionated stack](issues/01-one-opinionated-stack.md)
2. [Per-app session tokens](issues/02-per-app-tokens.md)
3. [Share apps as export bundles](issues/03-share-by-export-bundle.md) (worktree A)
4. [Share apps as git app repos](issues/04-share-by-app-repo.md) (worktree B)

03 and 04 both build on 02, and only one of them will land.
