# 06: Roles gate apps

**What to build:** In admin, the owner creates roles, ticking which codes hold each one with select all and deselect all, and can edit membership later. In the example app's settings, the owner gates it to anyone, one or more roles, or owner only. A guest's launcher lists only the apps their roles allow, and they can open those apps.

**Blocked by:** 05

**Status:** done

- [x] A code can hold several roles, and the session token carries them
- [x] A role change reaches a signed-in guest within one token lifetime
- [x] The `test` code holds every role
- [x] The hub launcher never lists an app the guard would refuse
- [x] The CI journey adds a guest who opens an app through a role and gets the 404 on an app gated to another role

## Decisions

- **Core holds each app's access rule (R, 2026-11-01).** The rule lives in core's app catalog, and admin edits it there. Core serves it at a public `GET /apps/<slug>/access`. The adapter keeps it for 60 seconds, as it keeps core's keys, and answers 503 if it can't load it. A change in admin reaches the app within a minute.
- **The dev runner hands core the app list (R, 2026-11-01).** The runner passes core `ROBKIT_APPS`, the slugs under `apps/` other than core, hub and admin. At boot core adds each app it doesn't know yet as owner-only, named after its slug, and never overwrites the owner's edits. Ticket 11 sets the same variable in production, and ticket 10 has `robkit add` write to it.
- **The CI journey re-gates the example app (R, 2026-11-01).** The guest holds Family and opens the example app while it is gated to Family. The owner then gates it to Friends in admin, the journey waits out the 60-second rule cache, and the guest gets the 404. No second app is added.

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from the build, for ticket 07 onwards. R hasn't reviewed the choices marked "chosen in the build" yet.

- **Data.** `core.roles` holds each role's name, unique, and migration 0002 seeds Family and Friends. `core.code_roles` says which codes hold which roles. The test code holds every role without rows, including roles made later. `core.apps` is the app catalog, keyed by slug, with `access` set to open, roles or owner, and `core.app_roles` lists the roles a gated app lets in. Roles list in name order.
- **Token (chosen in the build).** A guest's token carries `roles`, a list of role ids, never names, so renaming a role later won't break a gate. Core reads the roles fresh every time it reads a guest's session. If they changed, core hands back a new token at once, so the hub loading the launcher updates the cookie. Without that, the launcher would list an app that still answered 404 until the token expired.
- **Guard.** `AccessRule` gained `{ kind: "roles", roles }`. The owner opens every app, a guest holding any listed role gets in, and any other guest gets not found. `readAccessRule` parses a rule from JSON, for adapters and admin. Conformance cases gained `guestRoles`, the roles a guest holds. Ticket 07's adapter should sign its guest tokens with them, as `packages/hono/src/guarded.test.ts` does.
- **Core's routes.** Owner-only: `GET /roles`, `POST /roles` with `{ name, codeIds }`, `POST /roles/:id/codes` with `{ codeIds }`, `GET /apps` and `POST /apps/:slug/access`. Public: `GET /apps/:slug/access`, which apps read with no cookie. `GET /launcher` lists the apps `guard()` lets the cookie's holder open, by running each app's rule through the same guard.
- **Launcher (chosen in the build).** The hub asks core for the viewer's apps when it opens, every 30 seconds while its tab is visible, and when the viewer comes back to the tab. An app the owner closes to a guest drops off their open launcher within 30 seconds.
- **Adapter.** `guarded({ app, core })` loads the rule with `coreAccess` from `@robkit/session`, which keeps it for 60 seconds and shares one load between requests that arrive together. If the load fails, the app answers 503. `guarded({ access, core })` still takes a fixed rule, and admin uses it, since core's catalog doesn't hold the platform apps. Ticket 07's Start adapter should use `coreAccess` too.
- **Env (chosen in the build).** The runner gives each app `ROBKIT_APP`, its slug, so its guard knows which rule to ask for. Ticket 11 must set `ROBKIT_APP` on each app and `ROBKIT_APPS` on core in production.
- **Still open.** For up to a minute after the owner changes a rule, the launcher and the app can disagree. A newly gated app can show on the launcher and still answer 404, and a newly closed one can still let the guest in. Roles can't be renamed or deleted yet, and an app's name is its slug.
- **Admin.** Roles and Apps sit below the codes table. The code picker leaves out the test code and revoked codes. "Only me" is the owner-only choice.
- **CI time.** The role journey waits out the rule cache twice, so the whole-stack test now takes about two minutes.
- **Tests on Windows.** Same as 05. The whole suite passes in WSL Ubuntu 22.04, run from a clone of the branch.
