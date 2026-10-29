# 03: A guarded example app

**What to build:** A hand-written React + Hono example app runs at `example.localhost` with its own schema and role. Signed out, opening it redirects to hub login and returns to the app afterwards. Signed in as the owner, it opens and the handler receives the verified viewer. When the short-lived token expires but the session is live, the request bounces through core's `/refresh` and back without a click.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The guard is a pure function of the app's access rule and the viewer, returning allow, login, refresh or not found
- [ ] A shared JSON file of conformance cases drives the guard's tests and every adapter's tests
- [ ] The Hono adapter verifies tokens locally against core's cached public key, with no call to core per request
- [ ] Handlers get the viewer (user id included) from the adapter and never read the cookie themselves
- [ ] The example app's database role cannot read core's schema

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
