# 02: Core checks whole origins

**What to build:** Core knows only its domain, so it compares host names where it should compare origins. `/refresh` mints a token for any slug-shaped host on any port, whether or not the slug is an app, and CORS lets `http://admin.<domain>` call a hosted core with the owner's cookie ([review](../research/review-2026-11-09.md), "`/refresh` mints a token" and "CORS trusts the hub and admin by hostname only").

- **One address setting.** Core reads `ROBKIT_CORE_URL` and works its domain, protocol and port out of it with `coreInstall`, as an app's guard does. `pnpm dev` and `robkit deploy` already set it on core (`packages/dev/src/runner.ts`, `packages/create-robkit/src/deployment.ts`). Core no longer needs `ROBKIT_DOMAIN`. If it is set anyway and disagrees with the URL, core refuses to start and names both. `createApp` takes the origin where it took the domain.
- **`/refresh` mints for known apps only.** `next`'s origin must equal `install.origin(slug)` exactly: protocol, host and port. The slug must be `admin` or an app in core's catalog. Anything else gets the 400 it gets today.
- **CORS allows two origins.** Exactly `install.origin("hub")` and `install.origin("admin")`. The test that allows `http://hub.robkit.test:3000` on a hosted install is replaced by ones that refuse it.
- **The domain is lower case.** `readDomain` and `readCoreUrl` lower-case the host they read, so `Example.com` works rather than starting cleanly and refusing every request.
- **`@robkit/input/addresses`.** `onInstall` and `appOf` keep their meaning. Add what core needs to compare an origin, and use it in the hub's `next` check if that has the same gap.

`GET /apps/:slug/access` stays open to anyone, as its comment says. Record under `## Comments`, and in `SECURITY.md`'s known gaps, that it tells a stranger which slugs exist.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] `/refresh` answers 400 for a slug that isn't in the catalog, for the right slug on another port, and for http when core's origin is https
- [ ] `/refresh` still mints for admin and for a registered app on the install's exact origin, on a local install and a hosted one
- [ ] CORS refuses `http://` and an odd port on a hosted install, and still allows the hub and admin in local dev
- [ ] A mixed-case domain in `ROBKIT_CORE_URL` or `ROBKIT_DOMAIN` behaves as its lower-case form
- [ ] Core refuses to start with no `ROBKIT_CORE_URL`, or with a `ROBKIT_DOMAIN` that disagrees with it, and names the variable
- [ ] The whole-stack and production tests pass
- [ ] The PR's CI `gate` job passes on GitHub
