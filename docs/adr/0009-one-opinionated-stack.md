# 0009: Every install has one opinionated stack

**Status:** accepted, 2026-11-05 (R). Source: [One opinionated stack](../../.scratch/app-sharing/issues/01-one-opinionated-stack.md)

## Context

robkit once offered a choice of package manager, ORM, UI kit and dev tools at init. That made 72 combinations, a CI matrix to match, and apps that couldn't move between installs.

## Decision

Every install has pnpm, Drizzle, shadcn on Base UI, ESLint with Prettier, Husky with lint-staged, and Vitest. Init asks only for the folder and the example app's stack. Every install offers every stack: TanStack Start, and React with Hono. The templates are plain folders, `base` and one per stack.

## Consequences

- Every install of one robkit version has the same `packages/ui`, `packages/theme`, `packages/core-client` and catalog, so an app written for one install fits another.
- The other options were deleted outright, not hidden.
- A new stack is one entry in `packages/create-robkit/src/choices.ts` plus its folder in `templates/stacks/`.
