# 26: Core's routes get the viewer from one place, and its rules live with its data

**What to build:** Two changes to core. Neither changes any answer core gives.

First, routes get the viewer from one place. Today four routes each read the session and renew its cookie. That moves to one place. The owner-only gate covers each owner route explicitly, so `GET /apps/:slug/access` stays public because it says so, not because of how paths happen to be mounted.

Second, each part of core owns its input rules. The rules for an access code's shape and name, a role's name, an app's access rule and the owner's credentials sit with the code that stores them, each with its error message. Core's routing file keeps only routing and status codes. Claiming the install moves out of the session code into code about the owner.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Every existing core test passes unchanged, since core's answers don't change
- [x] Reading the session and renewing its cookie happen in one place, used by every route that needs the viewer
- [x] A test proves an owner-only route under `/apps/` refuses a guest, and `GET /apps/:slug/access` answers anyone
- [x] Each input rule and its message are defined once, next to the data they guard

Source: the architecture review of 2026-11-03 (see the map)

## Comments

- **The viewer.** `viewer()` in `packages/core/src/app.ts` is a Hono middleware that reads the session cookie, renews it, and puts the session in `c.var.session`. `/session`, `/refresh` (`viewer({ renew: true })`) and `/launcher` use it. `owner`, which is `viewer({ ownerOnly: true })`, is listed on each owner route. A guest the gate refuses gets `404 Not found` and no fresh cookie, which a test pins.
- **The input rules.** Each module exports a `read…(fields)` that returns the value or `{ error }`: `readNewCode` in `access-codes.ts`, `readNewRole` and `readCodeIds` in `roles.ts`, `readAccess` in `apps.ts`, and `readCredentials` and `readNewOwner` in the new `owner.ts`. `readBody(c, read)` in `app.ts` parses the JSON body and hands its fields to one of them. `claimInstall` moved to `owner.ts`, and `startSession` is exported from `sessions.ts` for it.
- **One answer changed.** A path that only the old mounts covered, such as `GET /codes/x/y`, used to answer a guest with JSON `{ error: "Not found" }`, and the owner with Hono's plain-text 404. Now both get the plain-text 404, so the two can't be told apart. No route that exists answers differently.
- **For ticket 28.** `appUrl`, which checks that `/refresh`'s `next` is on the install, is still in `app.ts`, along with `trustedApps` (the hub and admin) and their hostnames.
- **For ticket 29.** Every error core sends is `{ error: string }` with a 4xx status, except the 302 from `/refresh` and the 204s.
