# 28: The install's addresses are worked out in one place

**What to build:** Several packages work out the same addresses from an install's domain: core at `core.<domain>`, the hub at `hub.<domain>` and an app at `<slug>.<domain>`. They also check whether a `next` URL is on the install, and know the platform apps' names and the default domain and port. Each of these is written separately in the request guard, the hub, admin, core, the dev runner, init's printed next steps and the whole-stack test. After this ticket, one module turns a domain into these addresses and answers whether a URL belongs to the install. Ticket 11 changes domains and ports, and then has one place to get right.

**Blocked by:** 27

**Status:** needs-info

- [ ] Swapping between core's and the hub's origin is written once
- [ ] Checking that a `next` URL is on the install is written once, and core and the hub both use it
- [ ] The platform apps' names (core, hub and admin) are written once, and the dev runner and core use them
- [ ] The whole-stack test builds its URLs with the same module

**Open:**

- Where does the module live? The hub and admin are template code the owner owns, and only `apps/core` may import `@robkit/core`. Recommended: a small pure export from `@robkit/session`, which the hub, admin, core and the dev runner can all import without breaking the layer rule.

Source: the architecture review of 2026-11-03 (see the map)
