# 29: The hub and admin call core one way

**What to build:** The hub and admin each call core and read its `{ error }` answers. Today that's written three times with two result shapes, and the tests check `fetch`'s exact arguments rather than what the page gets back. After this ticket, both apps call core through one helper with one result shape, and the tests check results. Ticket 15 rewrites the hub and admin for each UI kit, so it carries one copy instead of three.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The hub and admin call core through one helper with one result shape
- [x] The hub's and admin's API tests check what a call returns for each of core's answers, including core being unreachable, not the arguments passed to `fetch`
- [x] The guest, owner and role journeys pass

Source: the architecture review of 2026-11-03 (see the map)

## Comments

- **The helper.** `callCore(core, method, path, { body, read })` in the install's `packages/core-client` (`@internal/core-client`), from the `base` template layer, so it doesn't depend on the UI kit. It answers `Result<T>`: `{ ok: true, value }` or `{ ok: false, error }`, where the error is core's `{ error }` sentence, "Core answered <status>.", "Couldn't reach core at <origin>." or "Core sent an answer this page can't read.". Without `read`, a call answers `undefined`. `isRecord` and `listOf` help write readers. The install's workspace now includes `packages/*`. Chosen in the build, awaiting R's review: an install package rather than a `@robkit/*` export, since the hub and admin are template code the owner owns.
- **The fake core.** `@internal/core-client/fake-core` gives `fakeCore(origin, routes)`, a `fetch` that answers routes such as `"POST /login"` and, like core, a plain 404 for any other path, plus `unreachable`. Tests stub it in and check results. A route sees the JSON that was posted and the `Request`, so a test checks what was sent through what core answers.
- **For ticket 15.** Each kit's hub and admin import `@internal/core-client` and keep their `*-api.ts` files as they are. Only the components change.
- **For ticket 10.** An app template that calls core from the browser can use the same package.
