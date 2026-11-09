# 05: The guard refuses a cross-origin write

**What to build:** `SameSite=Lax` sends an app's cookie with a form posted from any sibling subdomain, because a browser counts subdomains of one domain as the same site. So a page on `evil.<domain>` can post to `notes.<domain>/api/…` and the handler runs as the viewer ([review](../research/review-2026-11-09.md), "A sibling app can act on another app as the viewer"). The guard already stands in front of every request, and after ticket 01 it knows the app's own origin, so it can refuse these before a handler runs.

- **Which requests.** A request whose method is GET, HEAD or OPTIONS passes as today. Every other method is a write. A WebSocket handshake that reaches the guard counts as a write too.
- **The rule for a write.** A browser can't forge `Sec-Fetch-Site`, so when it is present it decides, whatever `Origin` says:

  | `Sec-Fetch-Site`           | `Origin`                         | The guard     |
  | -------------------------- | -------------------------------- | ------------- |
  | `same-origin` or `none`    | any                              | passes        |
  | `same-site` or `cross-site` | any                              | refuses, 403  |
  | absent                     | absent                           | passes        |
  | absent                     | the app's own origin             | passes        |
  | absent                     | anything else, `null` or garbage | refuses, 403  |

  The 403 is plain text that says why, sent before the guard reads the session.
- **Clients that aren't browsers still work.** A server or a script sends neither header and carries no cookie the viewer didn't give it.
- **Both ports.** `requestGuard` and Go's `Guarded` refuse the same requests, from one shared table of cases.
- **A form post after the token lapsed.** A POST that is a navigation (`Sec-Fetch-Mode: navigate`) and meets a lapsed token gets a small HTML page linking to `/_robkit/refresh`, not the JSON 401 a `fetch` gets.
- **What it doesn't cover, said plainly.** `SECURITY.md` says the guard refuses cross-origin writes, that a GET with side effects is the app's own lookout, and that in a stack whose WebSocket upgrades never reach the guard the app must check `Origin` itself. Each stack's `AGENTS.md` says to change state only on POST, PUT, PATCH or DELETE, and names its own gaps: a Start server function declared as GET, and where upgrades go.

No option to allow other origins yet. Note it in the comments as the place one would go.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Every row of the table holds in every adapter and in Go, from one table both ports' tests read
- [ ] A refused write never reaches a handler
- [ ] A navigating POST with a lapsed token gets an HTML page with a link to refresh
- [ ] The whole-stack test posts to an app from a sibling app's origin and is refused, and the app's own page still posts
- [ ] `SECURITY.md` and each stack's `AGENTS.md` say what the guard refuses and what stays the app's job
- [ ] The PR's CI `gate` job passes on GitHub
