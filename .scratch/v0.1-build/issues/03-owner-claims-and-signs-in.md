# 03: The owner claims the install and signs in

**What to build:** On first run, with no owner in core's database, `hub.localhost` shows a one-time setup screen where the owner picks a username and password (the Coolify model). From then on the owner signs in there and sees an empty launcher. Signing out works.

**Blocked by:** 02

**Status:** needs-info

- [ ] With no owner in the database, the hub shows the setup screen; once an owner exists, the screen is gone and core refuses the setup call
- [ ] Core generates its Ed25519 key on first boot if none exists, signs the JWT with it, and publishes the public key at `/.well-known/jwks.json`
- [ ] The session cookie is HttpOnly, has a Max-Age and is scoped to the `ROBKIT_DOMAIN` parent domain (default `localhost`)
- [ ] The owner's password is stored hashed by core and never passes through init, config or env
- [ ] A wrong password is refused with a clear message, and repeated attempts are rate limited

**Open:**

- Whoever reaches a fresh hosted install first can claim it, as with Coolify. Guard the setup screen with a one-time token core prints to its log while no owner exists, or leave it open?
- The key follows the owner's first-run rule. Keep its private half in core's schema (read only by core's role), or in an env secret on the host?

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
