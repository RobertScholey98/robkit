# 01: One opinionated stack

**What to build:** Every install gets the same stack: pnpm, Drizzle, shadcn on Base UI, ESLint with Prettier, Husky and Vitest. Delete the other options and everything that only exists for them: bun, Yarn, Prisma, Kysely, Chakra, shadcn on Radix, the no-kit hub and admin, Playwright, the dev-tool toggles and the UI-kit opt-out. That includes their template layers, choice-table rows, package-manager table entries, tests, e2e installs, production installs and CI. The kit matrix exists to cover combinations of choices, so it goes too, with `tooling/matrix`, `kit-matrix.yml` and the nightly matrix job.

Both stacks stay (TanStack Start, and React with Hono), and more will come. Every install enables every stack, and `robkit add` offers all of them, so an app on any stack fits any install. The catalog covers every stack's dependencies.

Init asks for the install's folder and the example app's stack, and nothing else. Where a layer seam only existed to switch between options (the hub's and admin's `ui.tsx` swap, `withoutIt`, `with`, the package-manager table), flatten it into plain files if that makes the code simpler. Don't keep a seam for an option nobody can pick.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] `pnpm create-install` asks only for the folder and the example's stack, and the install runs under `pnpm dev`
- [ ] Each install has pnpm, Drizzle, shadcn on Base UI, ESLint with Prettier, Husky and Vitest
- [ ] `robkit add` offers both stacks in every install, and an added app on the other stack passes the guest journey
- [ ] No template, code path, test or workflow is left for a deleted option
- [ ] `AGENTS.md`, `GLOSSARY.md` and the map describe the one stack
- [ ] The gate passes: `pnpm turbo run lint typecheck test`, and the production e2e for the one install

**Answered (R, 2026-11-05):** delete the other options outright rather than hiding them. Keep both stacks.

Source: [App sharing PRD](../PRD.md)
