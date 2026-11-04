# 28: The install's addresses are worked out in one place

**What to build:** Several packages work out the same addresses from an install's domain: core at `core.<domain>`, the hub at `hub.<domain>` and an app at `<slug>.<domain>`. They also check whether a `next` URL is on the install, and know the platform apps' names and the default domain and port. Each of these is written separately in the request guard, the hub, admin, core, the dev runner, init's printed next steps and the whole-stack test. After this ticket, one module turns a domain into these addresses and answers whether a URL belongs to the install. Ticket 11 changes domains and ports, and then has one place to get right.

**Blocked by:** 27

**Status:** done

- [x] Swapping between core's and the hub's origin is written once
- [x] Checking that a `next` URL is on the install is written once, and core and the hub both use it
- [x] The platform apps' names (core, hub and admin) are written once, and the dev runner and core use them
- [x] The whole-stack test builds its URLs with the same module

**Answered:**

- Where does the module live? In `@robkit/session`, as the subpath `@robkit/session/addresses`, which imports nothing. The hub, admin, core and the dev runner can all import it without breaking the layer rule. (The ticket's recommendation, chosen in the build, awaiting R's review.)

Source: the architecture review of 2026-11-03 (see the map)

## Comments

- **The module.** `packages/session/src/install-addresses.ts`. `install({ domain, protocol, port })` gives `host(slug)`, `origin(slug)` and `onInstall(url)`. `installAt(url, app)` finds the install from core's or the hub's own address, or returns `undefined`. `platformApps`, `isPlatformApp`, `defaultDomain` and `defaultDevPort` are the rest. Its tests cover `https://*.robkit.dev` with and without a port.
- **The fake core.** `@internal/test-session` can't import `@robkit/session`, because `@robkit/session`'s tests import the fake core and turbo refuses the cycle. The fake core now states `hub` beside `origin` as a literal, and `conformanceAnswer` takes both. That leaves the guard's tests expecting literal URLs rather than recomputing them.
- **For ticket 10.** `robkit add` should refuse a platform app's name with `isPlatformApp`, as well as `slugProblem`'s rule, and print the new app's address with `install(...).origin(slug)`.
- **For ticket 11.** A hosted install needs no new address config: the guard finds the hub from `ROBKIT_CORE_URL` (such as `https://core.robkit.dev`), the hub finds core and the apps from its own page, and admin finds the hub from core's URL. Core takes only its domain, so its `next` check accepts http and https on any subdomain. Whether a domain is local (`isLocal` in core's `domain.ts`, and `loopback-fetch.ts` in `@robkit/session`) is still decided in two places; move it here if 11 touches either.
- **For ticket 29.** The hub's `core-origin.ts` is now a thin wrapper over `installAt`, and admin's `introLink` uses it too. The one helper for calling core can take core's origin from `coreOrigin` in the hub and from `ROBKIT_CORE_URL` in admin.
