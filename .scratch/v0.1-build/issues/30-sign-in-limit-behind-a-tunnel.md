# 30: The sign-in limit sees each client behind a tunnel

**What to build:** Core limits failed sign-ins per client, and takes the client from the last `X-Forwarded-For` entry. That holds locally and behind Caddy. Behind a Cloudflare tunnel into Coolify's Traefik, as R's Coolify method runs, the last entry is the tunnel's own address, so every visitor shares one limit, and anyone can lock the owner out for a while by failing on purpose. After this ticket, core finds the client the way the host forwards it, and the limit counts each visitor on its own.

**Blocked by:** 11

**Status:** needs-info

- [ ] Behind a Cloudflare tunnel and Traefik, two visitors' failed sign-ins count separately
- [ ] A visitor can't pick their own client address by sending a header
- [ ] Locally, the dev proxy's address handling is unchanged

**Open:**

- Which header core trusts in production. Recommended: `CF-Connecting-IP` when the install sets `ROBKIT_TRUSTED_PROXY=cloudflare`, and the last `X-Forwarded-For` entry otherwise, since only a tunnel can set Cloudflare's header past Traefik.

Source: the build of ticket 11 (2026-11-03)
