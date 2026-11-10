# 0017: Provisioning is its own package

**Status:** decided in the [Just use it PRD](../../.scratch/just-use-it/PRD.md) (decision 11), and built by [Core is one command](../../.scratch/just-use-it/issues/12-core-is-one-command.md), 2026-11-10. What the build chose awaits R's review.

## Context

The provision step gives each app its schema and role ([0007](0007-one-schema-and-role-per-app.md)). It lived in `@robkit/dev`, where the dev runner used it. Once core became one command that provisions, migrates and serves ([0016](0016-platform-wiring-lives-in-packages.md)), core needed it in production too. The PRD weighed three places for it:

- In core, with the dev runner importing core. That pulls core, Hono and Drizzle into `npm create robkit`, which depends on the dev runner.
- In the dev runner, with core depending on `@robkit/dev`. That puts the dev runner in core's image.
- In a small package below both.

## Decision

A small package below both: `@robkit/provision`. It depends on `@robkit/input` and `postgres` alone. `robkit-core start` runs it before it migrates, the dev runner runs it before `pnpm dev` starts the apps, and create-robkit uses it to work out each app's `DATABASE_URL` for a deploy.

It returns what it refuses as a value: a name that isn't a slug, the role it connects as, a superuser, and a database secret shorter than 32 characters. Each command prints its own message for it. The commands' one handler, `runCommand`, moved to `@robkit/input/command` in the same change, so core's command needs nothing from the dev runner.

## Consequences

- Core's image holds the provision step and not the dev runner, and `npm create robkit` doesn't hold core.
- Two cores can start together. When Postgres says another run got there first, the package tries again (`lost-race.ts`). It takes no advisory lock, which any app's role could hold.
- `provisionDatabases` stops at the first app it refuses, so the apps before that one are already provisioned.
- `robkit-core start` provisions and migrates, then serves in a child whose environment holds neither `ROBKIT_ADMIN_DATABASE_URL` nor `ROBKIT_DB_SECRET`, so nothing core logs or dumps can carry them.
- A SIGTERM that arrives while `robkit-core start` provisions or migrates is ignored until Docker kills the container. The map lists it as a known gap.
