# 30: The sign-in limit sees each client behind a tunnel

**What to build:** Core limits failed sign-ins per client, and takes the client from the last `X-Forwarded-For` entry. That holds locally and behind Caddy. Behind a Cloudflare tunnel into Coolify's Traefik, as R's Coolify method runs, the last entry is the tunnel's own address, so every visitor shares one limit, and anyone can lock the owner out for a while by failing on purpose. After this ticket, core finds the client the way the host forwards it, and the limit counts each visitor on its own.

**Blocked by:** 11

**Status:** done

- [x] Behind a Cloudflare tunnel and Traefik, two visitors' failed sign-ins count separately
- [x] A visitor can't pick their own client address by sending a header
- [x] Locally, the dev proxy's address handling is unchanged

**Answered:**

- Which header core trusts in production. Core trusts `CF-Connecting-IP` when the install sets `ROBKIT_TRUSTED_PROXY=cloudflare`, and the last `X-Forwarded-For` entry otherwise. This was the ticket's recommended answer, chosen in the build, awaiting R's review.

Source: the build of ticket 11 (2026-11-03)

## Comments

- **Core.** `clientOf(c, trustedProxy)` in `packages/core/src/client.ts` names the client. `createApp` takes `trustedProxy`, and the install's core reads it with `readTrustedProxy(process.env.ROBKIT_TRUSTED_PROXY)`, which refuses any value but `cloudflare`, so a typo stops core rather than quietly sharing one limit. With Cloudflare trusted, a request without `CF-Connecting-IP` didn't come through Cloudflare, and all such requests share one limit, as requests without `X-Forwarded-For` already do.
- **Deploy.** `coolify.json` takes an optional `"trustedProxy": "cloudflare"`, and `robkit deploy` sets `ROBKIT_TRUSTED_PROXY` on core alone. The install's `docs/deploy.md` has a "Behind a Cloudflare tunnel" section. It says the setting is safe only when nothing but the tunnel reaches the host. Otherwise anyone can go around Cloudflare, name a fresh address on each guess, and lock out a real visitor by naming theirs.
- **Tests.** Core's tests cover both settings, for passwords and codes. With the setting off, a `CF-Connecting-IP` is ignored. With Cloudflare trusted, two visitors behind one tunnel address count apart, and requests without Cloudflare's header share one limit. The production e2e's Caddy now plays Cloudflare and the tunnel. Its https site sets `CF-Connecting-IP` from the peer, replacing what the visitor sent, and hands each request through one hop to a plain http site standing in for Traefik. Two visitor containers then sign in. The first fails six times, forging a new address in both headers each time, and is refused on the sixth. The second is still let try. With core's setting off, the same check fails: the second visitor is refused too.
- **Dev.** Unchanged. The dev runner doesn't set `ROBKIT_TRUSTED_PROXY`, so core keeps the dev proxy's last `X-Forwarded-For` entry, and the proxy's own tests are untouched.
- **Not covered.** Any container on Coolify's network can reach core directly and send either header; the map lists it under known gaps. Whether Coolify's Traefik also rewrites `X-Forwarded-Proto` to `http` behind the tunnel is untested: the stand-in trusts the hop, so it keeps `https`. Check redirects after the first live deploy.
