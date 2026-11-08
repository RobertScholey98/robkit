# 0001: Core owns the core tables and the signing key

**Status:** accepted, 2026-10-28 (R). Source: [Where does core run?](../../.scratch/kit/issues/08-where-core-runs.md)

## Context

robnet, robkit's predecessor, ran its auth inside one of its apps. Every app that wanted to know who was asking reached into the same tables, and deploys had to go in a set order.

## Decision

Core is its own Hono backend in its own process. It is the only code that touches the core tables (the owner, access codes, sessions, roles and the app catalog) and the only holder of the private signing key. The hub is a small React frontend that calls core over HTTP. Core's tables live in the `core` Postgres schema, declared with `core.table()` in `packages/core/src/schema.ts`.

## Consequences

- An app reaches core over HTTP only. It never imports `@robkit/core`, and its database role can't read the `core` schema. The layer rule and `robkit check` enforce the import side.
- Core generates its Ed25519 key on first boot and keeps the private half in its own schema, not in an environment variable.
- The hub and admin call core through `callCore` in the install's `packages/core-client`.
