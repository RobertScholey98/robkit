# 02: Owner signs in to the hub

**What to build:** On a developer machine, `pnpm dev` starts Postgres (Compose), core (Hono) and the hub (React, plain JSX + Tailwind) behind a dev proxy on `:3000` that routes `*.localhost`. The owner signs in at `hub.localhost` with the username and password set in config and sees an empty launcher. Signing out works. Core is the only process that touches the core schema, through its own role, and its migrate step runs before it starts.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Core signs an Ed25519 JWT and publishes its public key at `/.well-known/jwks.json`
- [ ] The session cookie is HttpOnly, has a Max-Age and is scoped to the `ROBKIT_DOMAIN` parent domain (default `localhost`)
- [ ] The owner's password is stored hashed by core, not read from env at request time
- [ ] Core's tables live in their own schema reached through a role that can touch nothing else
- [ ] Core migrates as a separate step before it starts, never at boot
- [ ] A wrong password is refused with a clear message, and repeated attempts are rate limited

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5
