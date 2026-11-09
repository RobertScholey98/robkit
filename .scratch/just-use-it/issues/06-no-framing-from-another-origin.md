# 06: No app can be framed from another origin

**What to build:** Nothing in an install tells a browser who may frame a page, so an imported app can put `admin.<domain>`, or any other app, in a frame. The frame is same-site, so the viewer's cookies go with it, and two tricked clicks in a framed admin open an app to everyone ([review](../research/review-2026-11-09.md), "A sibling app can frame admin"). Every adapter owns the path an answer takes, so the guard can send the header for every guarded app, admin included, from a package that updates.

- **The guard sends `X-Frame-Options: SAMEORIGIN`.** And `X-Content-Type-Options: nosniff`. Both go on every answer that passes through the guard: the answers it lets through, and its own redirects and pages.
- **Why that header and not a policy.** The obvious choice is `Content-Security-Policy: frame-ancestors 'self'`. But an app may send a policy of its own, and two policy headers don't survive every stack: on Express the app's `res.set` replaces the guard's, and on Next the guard's makes Next drop the app's. `X-Frame-Options` is a different header, so the two never meet. A browser obeys it unless a policy on the same answer has `frame-ancestors`. So an app's policy without `frame-ancestors`, such as one that only sets `default-src`, leaves the protection on.
- **An app changes who may frame it in its own policy, and only there.** To allow a framer, an app sets `Content-Security-Policy: frame-ancestors 'self' https://hub.<domain>` on its answers, and the browser follows that. To refuse every framer, its own origin included, it sends `frame-ancestors 'none'`. So `guarded()` needs no option for it.
- **Setting `X-Frame-Options` in the app isn't supported.** On Next the guard's value always wins: Next copies the proxy's headers onto the answer first, and then drops a route's header of the same name (`send-response.js`). On the other stacks the app's value may win. Don't make the stacks agree. Tell the app's author to use `frame-ancestors`, which works the same on every stack.
- **Each stack's way.** Express and Go set the headers before the handler runs, so nothing wraps the response. Hono and Start add them to the answer on its way out, where the app set none; an answer whose headers can't be changed, such as `Response.redirect()` or one passed through from `fetch`, is copied first. Next's guard answers before the page exists, so it sets them on the answer it passes on. Prove each with a route that sends its own policy: both headers arrive, and the app's policy is unchanged.
- **Once each, and not on an upgrade.** No answer carries either header twice. Express's adapter appends the headers of the guard's own answers, so a header set before the handler must not be appended again. An answer with status 101 is left as it is: a `Response` can't be copied with that status.
- **Core.** Core sends `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` and `nosniff` on every answer, errors included.
- **HSTS where the install is https.** Core and the guard send `Strict-Transport-Security` when the install's origin is https. Pick the max-age and say why in the comments. No `includeSubDomains`: the domain may hold hosts robkit doesn't run.
- **What isn't covered.** Files a stack serves without the guard, such as an app's built scripts and styles, don't carry the headers, and aren't pages. The hub isn't guarded: tickets 10 and 11 give it the same headers, from `robkit()` in dev and `servePage()` in production. Say both in the comments. And a frame isn't the only way to steal a click: a sibling app can still open admin in a window of its own and time a double-click onto one of its buttons. These headers don't stop that.
- **Docs.** `SECURITY.md` says no guarded app can be framed from another origin by default, and what isn't covered, the opened window included, so nobody reads it as "admin's clicks are safe". Each stack's `AGENTS.md` says how to allow a framer, and Next's says its own `X-Frame-Options` won't arrive.

Add this ticket's cases to `tooling/test-session/request-cases.json`, the shared file ticket 01 made, as a new kind, so both ports run them.

**Blocked by:** 04, 05

**Status:** ready-for-agent

- [ ] Every answer that passes through the guard, on every stack and from admin, carries both headers: pages, API answers, the guard's redirects and its own pages
- [ ] On every stack, an app that sends its own `Content-Security-Policy` with no `frame-ancestors` gets the guard's `X-Frame-Options` beside it, and its policy arrives unchanged
- [ ] An app that sends `frame-ancestors` naming the hub can be framed by the hub, shown in a browser test on one stack
- [ ] A Next route that sets its own `X-Frame-Options` arrives with one such header, the guard's, and a Next route that sends `frame-ancestors` arrives with its policy unchanged
- [ ] No answer on any stack carries `X-Frame-Options` or `nosniff` twice, the guard's own redirects on Express included
- [ ] An answer with unchangeable headers, a redirect made with `Response.redirect()`, still gets both headers and doesn't throw, and an answer with status 101 passes through untouched
- [ ] Core sends its three headers on every answer
- [ ] An https install sends HSTS from core and from guarded apps, and an http one doesn't
- [ ] The whole-stack test loads admin and an app in a frame from a sibling app's page, and the browser refuses both
- [ ] The production test passes over https and asserts HSTS; the PR carries the `production` label
- [ ] The PR's CI `gate` job passes on GitHub
