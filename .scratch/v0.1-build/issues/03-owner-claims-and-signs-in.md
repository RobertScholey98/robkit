# 03: The owner claims the install and signs in

**What to build:** On first run, with no owner in core's database, `hub.localhost` shows a one-time setup screen where the owner picks a username and password (the Coolify model). From then on the owner signs in there and sees an empty launcher. Signing out works.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] With no owner in the database, the hub shows the setup screen; once an owner exists, the screen is gone and core refuses the setup call
- [ ] Core generates its Ed25519 key on first boot if none exists, signs the JWT with it, and publishes the public key at `/.well-known/jwks.json`
- [ ] The session cookie is HttpOnly, has a Max-Age and is scoped to the `ROBKIT_DOMAIN` parent domain (default `localhost`)
- [ ] The owner's password is stored hashed by core and never passes through init, config or env
- [ ] A wrong password is refused with a clear message, and repeated attempts are rate limited

**Decided:**

- R, 2026-11-01: the setup screen stays open, as in Coolify. No one-time token, locally or hosted. Whoever reaches a fresh install first claims it, so the owner should claim a hosted install as soon as it's up.
- R, 2026-11-01: the private half of the signing key lives in core's schema, readable only by core's role. Core generates it on first boot, so there is no key to set in env when deploying.

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
