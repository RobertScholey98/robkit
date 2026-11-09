# 04: Core checks whole origins

**What to build:** Core knows only its domain, so it compares host names where it should compare origins. `/refresh` mints a token for any slug-shaped host on any port, whether or not the slug is an app, and CORS lets `http://admin.<domain>` call a hosted core with the owner's cookie ([review](../research/review-2026-11-09.md), "`/refresh` mints a token" and "CORS trusts the hub and admin by hostname only").

- **Core knows its own origin.** Core's settings gain `ROBKIT_CORE_URL`, which `pnpm dev` already gives every app. Unset on a hosted install, it is `https://core.<domain>`. Unset on a local one, core refuses to start and says to set it. It must agree with `ROBKIT_DOMAIN`. `robkit deploy` sets it on core.
- **`/refresh` mints for known apps only.** `next`'s origin must equal `install.origin(slug)` exactly: protocol, host and port. The slug must be `admin` or an app in core's catalog. Anything else gets the 400 it gets today.
- **CORS allows two origins.** Exactly `install.origin("hub")` and `install.origin("admin")`. The test that allows `http://hub.robkit.test:3000` on a hosted install is replaced by ones that refuse it.
- **The domain is lower case.** `readDomain` lower-cases what it reads, so `ROBKIT_DOMAIN=Example.com` works rather than starting cleanly and refusing every request.
- **`@robkit/input/addresses`.** `onInstall` and `appOf` keep their meaning. Add what core needs to compare an origin, and use it in the hub's `next` check too if it has the same gap.

`GET /apps/:slug/access` stays open to anyone, as its comment says. Record under `## Comments`, and in `SECURITY.md`'s known gaps, that it tells a stranger which slugs exist.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] `/refresh` answers 400 for a slug that isn't in the catalog, for the right slug on another port, and for http on a hosted install
- [ ] `/refresh` still mints for admin and for a registered app on the install's exact origin, locally and hosted
- [ ] CORS refuses `http://` and an odd port on a hosted install, and still allows the hub and admin in local dev
- [ ] `ROBKIT_DOMAIN=Example.com` behaves as `example.com`
- [ ] Core refuses to start on a local domain with no `ROBKIT_CORE_URL`, or with one that disagrees with `ROBKIT_DOMAIN`, and names the variable
- [ ] `robkit deploy` sets `ROBKIT_CORE_URL` on core, and the production test passes
- [ ] The PR's CI `gate` job passes on GitHub
