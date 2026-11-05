# 0005: One owner, who claims the install on first run

**Status:** accepted, 2026-10-28 and 2026-11-01 (R). Sources: [What is robkit's domain glossary?](../../.scratch/kit/issues/03-domain-glossary.md), [How should the init and add wizards flow?](../../.scratch/kit/issues/11-cli-flow.md)

## Context

An install belongs to one person who runs it for their friends and family. Init could ask for the owner's login up front, but a hosted install would then carry a password in its config, and init would need to know the domain.

## Decision

Each install has exactly one owner. Everyone else is a guest. The owner claims the install on first run, on the hub's setup screen, as with Coolify. The setup screen stays open, with no one-time token, until someone claims it.

## Consequences

- Init asks no login question and no domain question. `ROBKIT_DOMAIN` is runtime config, `robkit.localhost` by default.
- Claim a hosted install as soon as it's up, since the first visitor can claim it.
- The owner may open every app. Admin is owner-only, whatever core's catalog says.
