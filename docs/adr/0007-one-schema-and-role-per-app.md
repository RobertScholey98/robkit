# 0007: One Postgres, with a schema and role per app

**Status:** accepted, 2026-10-28 and 2026-11-03 (R). Sources: [How does each app get its database?](../../.scratch/kit/issues/09-app-databases.md), [Provisioning is its own step](../../.scratch/v0.1-build/issues/23-provision-step.md)

## Context

Each app needs its own data, kept apart from core's and from other apps'. A database server per app is heavy to run, back up and start locally.

## Decision

An install runs one Postgres. Each app with a `migrate` script gets its own schema and a login role, both named after its slug, and the role can touch only that schema. The provision step (`provisionApps` in `@robkit/dev`) creates both and then runs the app's `migrate` script. Core gets its own schema the same way.

## Consequences

- A slug must be a plain Postgres identifier and a hostname label: lowercase letters and digits, starting with a letter. `slugProblem` in `@robkit/dev` holds the rule.
- In production each role's password is an HMAC of its slug under one install secret, `ROBKIT_DB_SECRET`, so `robkit database-urls` can print each app's `DATABASE_URL` without storing it.
- The `migrate` script runs on every `pnpm dev` and every container start, so migrations must be safe to run again.
