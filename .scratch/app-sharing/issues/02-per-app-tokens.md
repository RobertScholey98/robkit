# 02: Per-app session tokens

**What to build:** No app's server ever sees a token it could use anywhere else. Today core sets one `robkit_session` cookie on the parent domain, so every app's server receives a token that core and admin accept, and core will renew it into a fresh one. One imported app could act as the owner. After this ticket:

- Core's own session cookie is host-only on `core.<domain>`. Only core reads it.
- Each app, admin included, gets its own token with its slug as the audience, in a host-only cookie on `<slug>.<domain>`.
- An app's guard accepts only a token whose audience is its own slug. Core accepts only its own audience.
- Nothing an app holds can be turned into a token for another app or for core. Refresh works from core's own cookie, never from a token an app sends.

**A sketch, not a rule:** an app with no token of its own sends the browser to core's `/refresh?next=<url on the app>`, which already exists. Core reads its own cookie and sends the browser back to a callback on the app (for example `/_robkit/session`), carrying a token minted for that app's slug. `requestGuard` handles the callback itself, so the adapters don't change: it checks the token's signature and audience, sets the app's host-only cookie, and redirects to `next` on the same app. Keep the token out of logs and referrers as far as you can (`no-store`, `Referrer-Policy: no-referrer`, an immediate redirect). If a better shape turns up while building, take it and say why in the Comments.

Things to check: the hub's and admin's calls to core over CORS still carry core's cookie; sign-out still signs the browser out everywhere it can, and any app token left alive until expiry is written down as a known gap; local dev (`*.robkit.localhost`, http) and production (https behind the proxy) both work; Safari's existing gap doesn't get worse.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A token minted for one app is refused by every other app, by admin and by core
- [ ] Core's cookie never reaches an app's server
- [ ] A guest still opens an app from the launcher with no extra sign-in, on both stacks
- [ ] A lapsed app token renews through core without the guest noticing
- [ ] Sign-out ends the session in core, and the gap for app tokens still alive is in the map's "Known gaps"
- [ ] The guard's conformance cases and every adapter cover the audience check
- [ ] The gate and the production e2e pass

**Answered (R, 2026-11-05):** fix this now, before app sharing, on both sharing branches.

Source: [App sharing PRD](../PRD.md)
