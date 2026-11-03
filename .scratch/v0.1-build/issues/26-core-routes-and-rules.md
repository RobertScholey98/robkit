# 26: Core's routes get the viewer from one place, and its rules live with its data

**What to build:** Two changes to core. Neither changes any answer core gives.

First, routes get the viewer from one place. Today four routes each read the session and renew its cookie. That moves to one place. The owner-only gate covers each owner route explicitly, so `GET /apps/:slug/access` stays public because it says so, not because of how paths happen to be mounted.

Second, each part of core owns its input rules. The rules for an access code's shape and name, a role's name, an app's access rule and the owner's credentials sit with the code that stores them, each with its error message. Core's routing file keeps only routing and status codes. Claiming the install moves out of the session code into code about the owner.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Every existing core test passes unchanged, since core's answers don't change
- [ ] Reading the session and renewing its cookie happen in one place, used by every route that needs the viewer
- [ ] A test proves an owner-only route under `/apps/` refuses a guest, and `GET /apps/:slug/access` answers anyone
- [ ] Each input rule and its message are defined once, next to the data they guard

Source: the architecture review of 2026-11-03 (see the map)
