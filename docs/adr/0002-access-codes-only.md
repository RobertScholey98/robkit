# 0002: Guests sign in with access codes only

**Status:** accepted, 2026-10-28 (R). Sources: [What session token and guard does the kit ship?](../../.scratch/kit/issues/07-session-and-guard.md), [Who may sign in through OIDC?](../../.scratch/kit/issues/15-oidc-signup-policy.md)

## Context

robkit hosts small apps for friends and family. Accounts, passwords and email delivery are heavy for a guest who wants to open one app, and every login method multiplies what the access layer must handle.

## Decision

A guest signs in by typing an access code, or by opening an intro link that carries one. The owner creates codes in admin. OIDC and email with a password are out of v0.1. The owner signs in with the password they set when they claimed the install.

## Consequences

- Core stores access codes as plain text, so admin can show a code and its intro link at any time.
- A code can expire or be revoked. Either ends its sessions at the next refresh.
- Adding another login method later means rethinking the access layer. R accepted that cost.
- Init seeds a local-only code, `test`, that works while the domain ends in `.localhost`.
