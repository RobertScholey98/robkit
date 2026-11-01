# 04: A guarded example app

**What to build:** A hand-written React + Hono example app runs at `example.robkit.localhost` with its own schema and role. Signed out, opening it redirects to hub login and returns to the app afterwards. Signed in as the owner, it opens and the handler receives the verified viewer. When the short-lived token expires but the session is live, the request bounces through core's `/refresh` and back without a click. This ticket also starts the end-to-end journey that every later ticket extends.

**Blocked by:** 03

**Status:** done

- [x] The guard is a pure function of the app's access rule and the viewer, returning allow, login, refresh or not found
- [x] A shared JSON file of conformance cases drives the guard's tests and every adapter's tests
- [x] The Hono adapter verifies tokens locally against core's cached public key, with no call to core per request
- [x] Handlers get the viewer (user id included) from the adapter and never read the cookie themselves
- [x] The example app's database role cannot read core's schema
- [x] A Playwright journey (signed-out redirect, owner sign-in, refresh bounce) runs in robkit's CI

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from the build, for ticket 05 onwards. R hasn't reviewed the choices marked "chosen in the build" yet.

- **Packages.** `@robkit/session` has the token claims, `readSessionToken`, the `robkit_session` cookie name and `coreKeys`. Minting stays in core. `@robkit/guard` is the outcome table. `@robkit/hono` exports `guarded({ access, core })`, and handlers read `c.var.viewer`.
- **Guard.** Rules are `open` and `owner`. Session states are signed out, expired and the owner. Both rules send an expired token to refresh, so the owner still sees themselves on an open app. No cell gives not found yet. Ticket 05 adds the guest column and the first not-found cases to `packages/guard/conformance.json`, and adapters pick them up from there.
- **Core's address is config (chosen in the build).** Apps get `ROBKIT_CORE_URL`, which the dev runner sets to `http://core.<domain>:<devPort>`. The adapter takes core's keys and the `/refresh` and hub addresses from it, never from the request's Host, because a Host port would let a request pick whose keys the app trusts. Ticket 11 must set `ROBKIT_CORE_URL` to core's public https origin.
- **How apps reach core (chosen in the build).** Node can't resolve `*.localhost`, and its `fetch` drops a Host header. So `coreKeys` sends `*.localhost` requests to 127.0.0.1 with the original Host, through the proxy, as browsers do. Keys are cached until a token arrives with an unknown `kid`.
- **`/refresh` (chosen in the build).** `GET /refresh?next=<url>` accepts only http(s) URLs on a subdomain of the install, and answers 400 otherwise. A live session always gets a fresh token, even when core thinks the old one is still live, so small clock skew can't loop. A dead session gets its cookie cleared. Either way it redirects back to `next`, and the app's guard decides about login.
- **Adapter answers.** A page load (a GET or HEAD with `Sec-Fetch-Mode: navigate`, or with no fetch metadata and an `Accept` that includes `text/html`) gets a 302. Any other request gets 401 JSON `{ error, location }`, which ticket 07's client helper can follow. If core's keys can't load, the app answers 503 rather than treating the visitor as signed out.
- **Hub.** After sign-in or setup, the hub goes to `?next=` if it is on one of the install's subdomains.
- **Still open.** If an app's clock runs more than the 15-minute token lifetime ahead of core's, the app and `/refresh` redirect to each other forever. There's no loop guard.
- **Example app.** `apps/example` runs Vite with `@hono/vite-dev-server` and renders on the server only. Vite serves its own assets without the guard in dev. A production build is ticket 09's.
- **Tests on Windows.** `pnpm dev`, `tooling/e2e` and the runner tests need POSIX process groups, so they only run on Linux and macOS (CI). Core's `migrate.test.ts` and `repo-checks` also fail on Windows, on main as well as this branch.
