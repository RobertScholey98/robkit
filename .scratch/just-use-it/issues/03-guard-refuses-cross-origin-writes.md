# 03: The guard refuses a cross-origin write

**What to build:** `SameSite=Lax` sends an app's cookie with a form posted from any sibling subdomain, because a browser counts subdomains of one domain as the same site. So a page on `evil.<domain>` can post to `notes.<domain>/api/…` and the handler runs as the viewer ([review](../research/review-2026-11-09.md), "A sibling app can act on another app as the viewer"). The guard already stands in front of every request, and after ticket 01 it knows the app's own origin, so it can refuse these before a handler runs.

- **The rule.** A request whose method is GET, HEAD or OPTIONS passes as today. Any other passes when `Sec-Fetch-Site` is `same-origin` or `none`. Without that header, it passes when `Origin` is absent or equals the app's own origin. Anything else gets a 403 with a plain-text reason, before the guard reads the session.
- **Clients that aren't browsers still work.** A server or a script sends neither header and carries no cookie the viewer didn't give it.
- **Both ports.** `requestGuard` and Go's `Guarded` refuse the same requests, from one shared table of cases.
- **Old browsers get a page, not a loop.** A browser that sends no fetch metadata can't be told apart from a script, so today it bounces between a gated app and the hub for ever. When a page load arrives from the hub still without a token, the guard answers a page that says this browser can't sign in here.
- **A form post after the token lapsed.** A POST that is a navigation (`Sec-Fetch-Mode: navigate`) and meets a lapsed token gets a small HTML page linking to `/_robkit/refresh`, not the JSON 401 a `fetch` gets.
- **Docs.** `SECURITY.md`'s "What an imported app can and can't do" says the guard refuses cross-origin writes, and that a GET with side effects is the app's own lookout. Each stack's `AGENTS.md` says to change state only on POST, PUT, PATCH or DELETE.

No option to allow other origins yet. Note it in the comments as the place one would go.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A POST with `Sec-Fetch-Site: same-site` or `cross-site`, or with an `Origin` that isn't the app's, gets 403 and never reaches a handler, in every adapter and in Go
- [ ] A same-origin POST, and a POST with neither header, pass as today
- [ ] The cases are one table both ports' tests read
- [ ] A browser without fetch metadata that returns from the hub with no token gets a page, and no redirect
- [ ] A navigating POST with a lapsed token gets an HTML page with a link to refresh
- [ ] The whole-stack test posts to an app from a sibling app's origin and is refused
- [ ] `SECURITY.md` and each stack's `AGENTS.md` say what the guard refuses and what stays the app's job
- [ ] The PR's CI `gate` job passes on GitHub
