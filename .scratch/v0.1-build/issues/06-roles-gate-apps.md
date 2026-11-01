# 06: Roles gate apps

**What to build:** In admin, the owner creates roles, ticking which codes hold each one with select all and deselect all, and can edit membership later. In the example app's settings, the owner gates it to anyone, one or more roles, or owner only. A guest's launcher lists only the apps their roles allow, and they can open those apps.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A code can hold several roles, and the session token carries them
- [ ] A role change reaches a signed-in guest within one token lifetime
- [ ] The `test` code holds every role
- [ ] The hub launcher never lists an app the guard would refuse
- [ ] The CI journey adds a guest who opens an app through a role and gets the 404 on an app gated to another role

## Decisions

- **Core holds each app's access rule (R, 2026-11-01).** The rule lives in core's app catalog, and admin edits it there. Core serves it at a public `GET /apps/<slug>/access`. The adapter keeps it for 60 seconds, as it keeps core's keys, and answers 503 if it can't load it. A change in admin reaches the app within a minute.
- **The dev runner hands core the app list (R, 2026-11-01).** The runner passes core `ROBKIT_APPS`, the slugs under `apps/` other than core, hub and admin. At boot core adds each app it doesn't know yet as owner-only, named after its slug, and never overwrites the owner's edits. Ticket 11 sets the same variable in production, and ticket 10 has `robkit add` write to it.
- **The CI journey re-gates the example app (R, 2026-11-01).** The guest holds Family and opens the example app while it is gated to Family. The owner then gates it to Friends in admin, the journey waits out the 60-second rule cache, and the guest gets the 404. No second app is added.

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
