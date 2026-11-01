# 03: The owner claims the install and signs in

**What to build:** On first run, with no owner in core's database, `hub.robkit.localhost` shows a one-time setup screen where the owner picks a username and password (the Coolify model). From then on the owner signs in there and sees an empty launcher. Signing out works.

**Blocked by:** 02

**Status:** done

- [x] With no owner in the database, the hub shows the setup screen; once an owner exists, the screen is gone and core refuses the setup call
- [x] Core generates its Ed25519 key on first boot if none exists, signs the JWT with it, and publishes the public key at `/.well-known/jwks.json`
- [x] The session cookie is HttpOnly, has a Max-Age and is scoped to the `ROBKIT_DOMAIN` parent domain (default `robkit.localhost`)
- [x] The owner's password is stored hashed by core and never passes through init, config or env
- [x] A wrong password is refused with a clear message, and repeated attempts are rate limited

**Decided:**

- R, 2026-11-01: the setup screen stays open, as in Coolify. No one-time token, locally or hosted. Whoever reaches a fresh install first claims it, so the owner should claim a hosted install as soon as it's up.
- R, 2026-11-01: the private half of the signing key lives in core's schema, readable only by core's role. Core generates it on first boot, so there is no key to set in env when deploying.
- R, 2026-11-01: the default `ROBKIT_DOMAIN` is `robkit.localhost`, not `localhost`. Tested in Playwright's Chromium, Firefox and WebKit: Chromium and Firefox reject a `Domain=localhost` cookie. Under `robkit.localhost` they store the cookie, send it on the hub's fetches to core and on visits to other subdomains, even with `Secure` over http. WebKit stores a non-Secure cookie but doesn't send it on the hub's fetch to core, so local dev in Safari doesn't work yet. The `test` code's local-only rule becomes "the domain ends in `.localhost`".

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes from the build, for ticket 04 onwards:

- **Token.** An EdDSA JWT, with `kid` (the key's JWK thumbprint) in its header. Its claims are `sub` (owner id), `sid` (session id), `kind: "owner"`, `iat` and `exp`. It lives 15 minutes, and the session lives 30 days. The cookie is `robkit_session`: `HttpOnly; Path=/; Domain=<domain>; SameSite=Lax; Max-Age=2592000`, plus `Secure` unless the domain ends in `.localhost`.
- **`GET /session` already renews.** Core checks the token's signature, but the session row decides. An expired token with a live session gets a fresh cookie. Ticket 04's `/refresh` can reuse `readSession` in `packages/core/src/sessions.ts`.
- **Verify code lives in core for now.** `session-token.ts` holds the mint and verify functions and the claims. The Hono adapter needs verify and the claims but must not import core, so ticket 04 should move them into `@robkit/session`. Minting can stay in core, which keeps "only core signs" true by where the code is.
- **Core needs a migrated database to boot,** because `main.ts` creates the signing key before serving. On an unmigrated database it exits 1 with a raw Drizzle error. A friendlier message is still to do.
- **`ROBKIT_DOMAIN` is required by core.** The dev runner always sets it, so only production has to.
- **Rate limit.** The limit is 5 failed sign-ins per client in a sliding 15 minutes, held in memory. The client is the last `X-Forwarded-For` entry. The dev proxy now appends it, as Traefik does. Two sign-in attempts racing in parallel can both get past the check, so 5 is a soft limit.
- **POST rules.** Every POST needs `content-type: application/json` (otherwise 415) and a body of at most 16 KiB (otherwise 413).
- **Tests.** Each core test gets a fresh database (`packages/core/src/test/fresh-database.ts`) and a clock it can move (`fresh-app.ts`).
- **drizzle-kit.** It's set up in `packages/core` with `pnpm db:generate`. `schema.ts` doesn't export the `core` schema object, so drizzle-kit never emits `CREATE SCHEMA`, which core's role can't run.
- **Lint.** `robkit/layer` (`tooling/eslint/layers.js`) checks static, dynamic and relative imports, judging a relative import by the folder it resolves into. `robkit/core-schema` allows only `pgSchema("core")` and no `pgTable` in `packages/core`.
- **Core listens on 127.0.0.1** unless `HOST` is set, because its sign-in limit trusts `X-Forwarded-For` and only the proxy may set it. Ticket 11's container must set `HOST=0.0.0.0` and keep core's port off the public network.
- **Safari.** Local dev in Safari doesn't work, because WebKit doesn't send the cookie on the hub's fetch to core. This was tested in Playwright's WebKit, not in Safari itself.
