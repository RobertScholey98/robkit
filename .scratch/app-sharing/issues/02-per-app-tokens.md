# 02: Per-app session tokens

**What to build:** No app's server ever sees a token it could use anywhere else. Today core sets one `robkit_session` cookie on the parent domain, so every app's server receives a token that core and admin accept, and core will renew it into a fresh one. One imported app could act as the owner. After this ticket:

- Core's own session cookie is host-only on `core.<domain>`. Only core reads it.
- Each app, admin included, gets its own token with its slug as the audience, in a host-only cookie on `<slug>.<domain>`.
- An app's guard accepts only a token whose audience is its own slug. Core accepts only its own audience.
- Nothing an app holds can be turned into a token for another app or for core. Refresh works from core's own cookie, never from a token an app sends.

**A sketch, not a rule:** an app with no token of its own sends the browser to core's `/refresh?next=<url on the app>`, which already exists. Core reads its own cookie and sends the browser back to a callback on the app (for example `/_robkit/session`), carrying a token minted for that app's slug. `requestGuard` handles the callback itself, so the adapters don't change: it checks the token's signature and audience, sets the app's host-only cookie, and redirects to `next` on the same app. Keep the token out of logs and referrers as far as you can (`no-store`, `Referrer-Policy: no-referrer`, an immediate redirect). If a better shape turns up while building, take it and say why in the Comments.

Things to check: the hub's and admin's calls to core over CORS still carry core's cookie; sign-out still signs the browser out everywhere it can, and any app token left alive until expiry is written down as a known gap; local dev (`*.robkit.localhost`, http) and production (https behind the proxy) both work; Safari's existing gap doesn't get worse.

**Blocked by:** 01

**Status:** done

- [x] A token minted for one app is refused by every other app, by admin and by core
- [x] Core's cookie never reaches an app's server
- [x] A guest still opens an app from the launcher with no extra sign-in, on both stacks
- [x] A lapsed app token renews through core without the guest noticing
- [x] Sign-out ends the session in core, and the gap for app tokens still alive is in the map's "Known gaps"
- [x] The guard's conformance cases and every adapter cover the audience check
- [x] The gate and the production e2e pass

**Answered (R, 2026-11-05):** fix this now, before app sharing, on both sharing branches.

Source: [App sharing PRD](../PRD.md)

## Comments

What the build chose. It follows the sketch, with three changes, each the simplest safe reading; no question went to R:

- **Core always sends the browser back to the app.** With no live session, core's `/refresh` goes to the app's `/_robkit/session` with no token, rather than to the hub. The app's guard then decides, as the map's ticket 04 decision already says: an app open to anyone lets the visitor in as nobody, and a gated app sends them to the hub. Core can't make that call for admin, whose rule isn't in its catalog.
- **A state guards the callback.** The guard sends core a random state and keeps it in a host-only `robkit_state` cookie for 10 minutes; core passes it back, and the callback refuses a token without the matching state. Without it, anyone's link to `/_robkit/session?token=…` could plant a token in someone else's browser: another guest could make the owner act as them in an app. A second trip reuses the state the browser holds, so two tabs on their way back both arrive. The state is also the loop guard: a browser that keeps no cookie stops at the callback with a page saying so.
- **The app keeps core's word that nobody is signed in for a minute**, as `signed-out.<time>` in its own cookie, so an app open to anyone doesn't send a signed-out visitor round core on every page load. After the minute, a page load asks core again, and a call from the page counts the visitor as signed out, so an open app never reloads a signed-out visitor's page. The guard's login answer clears it, so after signing in at the hub the app asks core again rather than looping.

Also chosen:

- Only a page load from a browser that sends `Sec-Fetch-Mode: navigate` goes round core when the app holds nothing. A server, a link preview or an old browser counts as signed out, as before, so a client that keeps no cookies can't bounce for ever.
- An app token carries the viewer's kind, id and roles, its slug as `aud`, and no `sid`. It still lives 15 minutes: a shorter one would cost a trip through core, and in a page a full reload whenever a call finds it lapsed. Core's own token carries `aud: core`, and core reads no other, so it never renews from an app's token even though core signed it.
- Every cookie keeps the name `robkit_session` and is host-only. The app's cookie lasts 30 days, like core's session, so an expired token still says "refresh". Core and the guard read every `robkit_session` a request sends and take the first that is theirs, since a browser may still hold the old parent-domain cookie.
- At every refusal the callback answers a page, not a redirect: a bad state, a token for another audience, `next` off the app, or a token already expired by the app's clock. The last one closes the map's old gap where an app whose clock ran ahead of core's looped for ever.
- Core's `/refresh` refuses a `next` on core or the hub, two labels deep, or over http on a hosted install, since the token travels in the URL. Its redirect, the guard's to core and the callback's to `next` all send `no-store`; the two that carry the token send `Referrer-Policy: no-referrer`.
- `GuardedOptions` is `{ app, access?, core }`, and `GuardedRule` is gone. Admin's server passes `app: "admin"` with its owner-only rule. The guard owns `/_robkit/` on every app, and both stacks' `AGENTS.md` say so.
- The pure guard has a sixth state, `unknown`, which goes to `refresh` whatever the rule. `conformance.json` has seven new rows: an app of each rule holding nothing, and the owner's token for another app, for core and with no audience. Both adapters pass them, and each adapter has a test that takes a token at the callback.
- `isLocal` moved from core to `@robkit/session/addresses`, and `Install` has `appOf(url)`.
- `@internal/test-session`'s `token()` takes `{ ageSeconds, holder, audience }`, `cookieFor(case, slug)` sends what each case's visitor holds, and `refreshLocation`, `callbackFor`, `stateIn` and `signedOutCookie` cover the trip through core.

Known gaps are in the map's "Known gaps", marked app-sharing 02. The main one: after sign-out, an app the browser opened in the last 15 minutes still lets it in until that app's token expires. Core's session ends at once, so the hub, admin's calls to core and every refresh see the browser signed out.

For tickets 03 and 04 (app sharing), what an imported app holds and what it can do with it:

- It holds its own token, only on its own subdomain, for 15 minutes at a time. Admin, every other app and core refuse it, and core never renews from it. It never receives core's cookie or another app's.
- It learns who opens it: each viewer's id, kind and role ids. It can send any visiting browser through core's `/refresh` to learn that, but only ever for its own slug, since core mints for the app `next` is on and sends the token there.
- It can't plant a token in another app: core sends the other app's token to the other app's callback, which needs the state that app's guard set in its own host-only cookie.
- Its page can't use core's routes either: core's CORS answers only the hub and admin, and every POST needs JSON, so it preflights.
- Still open: its server on Coolify's network can reach core directly and set `X-Forwarded-For`, as the map's gap already says. `slugProblem` doesn't refuse `core`, `hub` or `admin`. A folder name keeps them apart in an install today, but an import should refuse those slugs, since core's own audience is `core`. An imported app mustn't route anything under `/_robkit/`.

Proof, on Ubuntu 22.04 in WSL with Node 24:

- The gate (`turbo run lint typecheck test`): 46 of 46 tasks, with 700 tests passed and 1 skipped. An earlier run lost one create-robkit test to a segfault in `pnpm run build` under load; it passed alone and in the full rerun.
- The production e2e: 1 file, 9 of 9 tests passed.
- The security tests fail when the guard and core stop checking the audience: 6 tests went red with the check removed.
- By hand, with curl on a new Start install under `pnpm dev`: claiming the install, then opening the example, went to core's `/refresh`, then to the example's `/_robkit/session` with `no-store` and `no-referrer`, then to the page signed in as the owner. Admin opened too. The browser held host-only `robkit_session` cookies on core, admin and the example: core's with `aud: core` and a `sid`, the example's with `aud: example` and no `sid`. The example's token sent to admin went to core for admin's own; as a call it got 401. Sent to core, it read as signed out, `/codes` answered 404, and `/refresh` sent admin no token. After sign-out at core, the example still let the browser in on its live token (the known gap), and without it went to the hub.
