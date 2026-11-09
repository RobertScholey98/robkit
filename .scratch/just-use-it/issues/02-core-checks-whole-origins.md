# 02: Core checks whole origins

**What to build:** Core knows only its domain, so it compares host names where it should compare origins. `/refresh` mints a token for any slug-shaped host on any port, whether or not the slug is an app, and CORS lets `http://admin.<domain>` call a hosted core with the owner's cookie ([review](../research/review-2026-11-09.md), "`/refresh` mints a token" and "CORS trusts the hub and admin by hostname only").

- **One address setting.** Core reads `ROBKIT_CORE_URL` and works its domain, protocol and port out of it with `coreInstall`, as an app's guard does. `pnpm dev` and `robkit deploy` already set it on core (`packages/dev/src/runner.ts`, `packages/create-robkit/src/deployment.ts`). Core no longer needs `ROBKIT_DOMAIN`. If it is set anyway and disagrees with the URL, core refuses to start and names both. `createApp` takes the origin where it took the domain.
- **`/refresh` mints for known apps only.** `next`'s origin must equal `install.origin(slug)` exactly: protocol, host and port. The slug must be `admin` or an app in core's catalog. Anything else gets the 400 it gets today.
- **CORS allows two origins.** Exactly `install.origin("hub")` and `install.origin("admin")`. The test that allows `http://hub.robkit.test:3000` on a hosted install is replaced by ones that refuse it.
- **The domain is lower case.** `readDomain` and `readCoreUrl` lower-case the host they read, so `Example.com` works rather than starting cleanly and refusing every request.
- **`@robkit/input/addresses`.** `onInstall` and `appOf` keep their meaning. Add what core needs to compare an origin, and use it in the hub's `next` check if that has the same gap.

`GET /apps/:slug/access` stays open to anyone, as its comment says. Record under `## Comments`, and in `SECURITY.md`'s known gaps, that it tells a stranger which slugs exist.

**Blocked by:** none

**Status:** done

- [x] `/refresh` answers 400 for a slug that isn't in the catalog, for the right slug on another port, and for http when core's origin is https
- [x] `/refresh` still mints for admin and for a registered app on the install's exact origin, on a local install and a hosted one
- [x] CORS refuses `http://` and an odd port on a hosted install, and still allows the hub and admin in local dev
- [x] A mixed-case domain in `ROBKIT_CORE_URL` or `ROBKIT_DOMAIN` behaves as its lower-case form
- [x] Core refuses to start with no `ROBKIT_CORE_URL`, or with an http one off localhost, and names the variable (the lead replaced the `ROBKIT_DOMAIN` check, 2026-11-09)
- [x] `pnpm dev`'s config refuses a `ROBKIT_DOMAIN` that isn't local (added by the lead, 2026-11-09)
- [x] After sign-in the hub sends the browser only to a page on an app's exact origin: it refuses an http downgrade on an https install, another port, `a.b.<domain>`, userinfo such as `https://notes.<domain>@evil.com/`, and a look-alike domain (added by the lead, 2026-11-09)
- [ ] The whole-stack and production tests pass
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### Changes the lead made, 2026-11-09

From the council's review of the plan, while the build ran:

1. **http is only ever local, and enforced.** `readCoreUrl` refuses an http origin unless its domain is local, and says to serve the install over https. `robkit-dev` refuses a `ROBKIT_DOMAIN` that isn't local, since `pnpm dev` serves only http. Without this, exact-origin checks plus ticket 03's protocol-led `Secure` would make `http://core.example.com` a working install with tokens in clear URLs.
2. **Core stops reading `ROBKIT_DOMAIN`.** The "refuses to start when `ROBKIT_DOMAIN` disagrees" behaviour and its criterion are dropped. I had built the check; it is gone in the commit that makes `ROBKIT_CORE_URL` core's one address setting.
3. **The hub's `next` check is required, with named cases.** I had already fixed it with `appAt`; the userinfo case was the one test missing, and is added.

### What I chose, and why

Chosen in the build.

- **The helper is `Install.appAt(url)`.** It gives the slug of the app `url` is on only when `url`'s origin equals `install.origin(slug)`. `onInstall` and `appOf` keep their meaning, as the ticket asks. A method on `Install` rather than a free function, so core and the hub compare against the same install they already hold.
- **Routes get the install, not the domain.** `SessionContext.domain` became `install: Install`, built once in `createApp` from `coreInstall(origin)`. The test code's standing and cookies still read `install.domain`.
- **Catalog membership is `accessOf(db, slug) !== undefined`.** It is the same lookup `GET /apps/:slug/access` uses, so ticket 24's "removed" state reaches `/refresh` by changing one function. A platform slug never reaches the catalog: admin mints, the hub and core don't.
- **The https check in `/refresh` is gone.** Core's origin is https off localhost (lead change 1), and `next` must match it exactly, so the old `isLocal(domain) || https` test said nothing more.
- **`next` is still normalised** to `new URL(next).href`, as `onInstall` did, so the callback gets the same URL as before.
- **`isLocal` moved to `env.ts`** so `readCoreUrl` can use it without an import cycle. `@robkit/input/addresses` still exports it, and the API report is unchanged.
- **`freshCore` takes `origin` and `apps`.** Its default origin is `https://core.robkit.test`, a hosted install. Tests that refresh register `notes`. `aCoreOrigin` is new in `@internal/test-session` beside `aDomain`.
- **`robkit deploy` still sets `ROBKIT_DOMAIN` on every app, core included.** Core ignores it. I left `deployment.ts` alone and said so in the deploy runbook.

### Proof

- Red first, through public interfaces: `readDomain` kept the case; `appAt` didn't exist; core's config read `ROBKIT_DOMAIN`; `readCoreUrl` took `http://core.example.com`; `readDevConfig` took `example.com`; CORS let 7 wrong-protocol or wrong-port origins through (`expected 'http://hub.robkit.test' to be null`); `/refresh` minted for 5 cases it now refuses, among them `https://other.robkit.test/` and `https://notes.robkit.test:8443/`; the hub returned to 4 `next`s it now refuses. So the review's three findings hold when run, not just read.
- `@robkit/input`: 228 tests. Core unit: 132. Core's db project in WSL: 222 passed. `@robkit/dev`'s env tests: 11. The hub's tests in a linked install: 18 in `core-origin.test.ts`, 60 in the app.
- `pnpm check` on Windows, with Go on `PATH`: 59 of 59 tasks.
- `pnpm check:all` in WSL: 60 of 61 tasks. `@internal/e2e` failed 6 of 85: my new config-problems test (core also printed "PORT is not set"; fixed in ff5a731), and 5 guest journeys that timed out waiting for the hub's page, with Vite module fetches timing out at load average 22 while another worker's suites ran.
- Rerunning `@internal/e2e` alone was worse and failed on the machine: Docker's API answered 500, Postgres connections were refused and reset, and stacks never came up, at load average 24. Owner journeys that passed in the first run failed in the second. I couldn't get a clean whole-stack run here; CI judges it.

### Not verified

- The whole-stack and production tests, locally: see above. The PR carries the `production` label so CI runs the production test.
- `pnpm dev` by hand in a browser.

### For other tickets

- **Ticket 03:** the install is `context.install` in every routes module; core's protocol is `new URL(context.install.origin("core")).protocol`. `setSessionCookie` in `routes/context.ts` still decides `Secure` with `isLocal(install.domain)`, and `standingOf` decides the test code the same way. Go's `ReadGuardEnv` (`go/session/options.go`) still accepts `http://core.example.com`; the lead assigned that to ticket 03, since it changes the Go port anyway.
- **Ticket 04:** `freshCore({ origin, apps, trustedProxy })` builds a core; `routes/session.ts` destructures `db` from the context now.
- **Ticket 12:** `CoreConfig.origin` replaces `domain`, and `createApp` takes `origin`. Core needs `ROBKIT_CORE_URL` and ignores `ROBKIT_DOMAIN`. `tooling/e2e/src/core-app.test.ts` boots core with `ROBKIT_CORE_URL`, and `config-problems.test.ts` runs `apps/core/src/main.ts` without it, which moves when `main.ts` goes.
- **Ticket 24:** `/refresh` asks `accessOf(db, slug)` whether core mints for a slug. Make a removed app answer `undefined` there and `/refresh` refuses it with no other change.
- **Ticket 20:** `packages/create-robkit/README.md`'s "Change a template" step 4 still names a digest in `generate.test.ts` that doesn't exist.
