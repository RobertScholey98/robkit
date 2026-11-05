# 0006: Roles gate apps, and core holds each app's access rule

**Status:** accepted, 2026-10-28 and 2026-11-01 (R). Sources: [What session token and guard does the kit ship?](../../.scratch/kit/issues/07-session-and-guard.md), [`robkit add`](../../.scratch/v0.1-build/issues/10-robkit-add.md)

## Context

robnet gave each access code a grant per app. With more than a few apps and guests, the owner had to tick a box for every pair.

## Decision

The owner creates roles in admin and gives them to access codes. Each app's access rule is one of: open to anyone, gated to one or more roles, or owner only. Core holds the rule in its app catalog and serves it at `GET /apps/<slug>/access`. An app declares the rule it starts with in its manifest, the `robkit` field of its `package.json`. Core uses it when it first sees the app, and the owner's edits in admin win after that.

## Consequences

- A guest's token carries their role ids, so a guard can decide without calling core.
- The guard keeps an app's rule for a minute, so a change in admin takes up to a minute to reach the app.
- Init seeds the roles Family and Friends. Roles can't be renamed or deleted yet.
- "Grant" is no longer a robkit word. See `GLOSSARY.md`.
