# 05: The guard refuses a cross-origin write

**What to build:** `SameSite=Lax` sends an app's cookie with a form posted from any sibling subdomain, because a browser counts subdomains of one domain as the same site. So a page on `evil.<domain>` can post to `notes.<domain>/api/…` and the handler runs as the viewer ([review](../research/review-2026-11-09.md), "A sibling app can act on another app as the viewer"). The guard already stands in front of every request, and after ticket 01 it knows the app's own origin, so it can refuse these before a handler runs.

- **Which requests.** A request whose method is GET, HEAD or OPTIONS passes as today. Every other method is a write. A WebSocket handshake that reaches the guard counts as a write too.
- **The rule for a write.** A browser can't forge `Sec-Fetch-Site`, so when it is present it decides, whatever `Origin` says:

  | `Sec-Fetch-Site`                                  | `Origin`                         | The guard    |
  | ------------------------------------------------- | -------------------------------- | ------------ |
  | exactly `same-origin` or `none`                   | any                              | passes       |
  | anything else, a list or an unknown word included | any                              | refuses, 403 |
  | absent                                            | absent                           | passes       |
  | absent                                            | the app's own origin             | passes       |
  | absent                                            | anything else, `null` or garbage | refuses, 403 |

  The 403 is plain text that says why, sent before the guard reads the session.
- **Clients that aren't browsers still work.** A server or a script sends neither header and carries no cookie the viewer didn't give it.
- **Both ports.** `requestGuard` and Go's `Guarded` refuse the same requests. The cases go in the shared file ticket 01 names.
- **A form post that can't go through.** A POST that is a navigation (`Sec-Fetch-Mode: navigate`) and meets a lapsed token, or a signed-out viewer on a gated app, gets a small HTML page, not the JSON 401 a `fetch` gets. The page links to `/_robkit/refresh`, or to the hub's sign-in, with `next` set to the page the form was on: the `Referer`, when it is a page on the app's own origin and not under `/_robkit/`, and the app's `/` otherwise.
- **What it doesn't cover, said plainly.** `SECURITY.md` says the guard refuses cross-origin writes, that a GET with side effects is the app's own lookout, and that in a stack whose WebSocket upgrades never reach the guard the app must check `Origin` itself. Each stack's `AGENTS.md` says to change state only on POST, PUT, PATCH or DELETE, and names its own gaps. Start's is the sharpest: `createServerFn()` is a GET unless told otherwise, so every server function that changes state must say `method: "POST"`.

The example apps record a visit as their page loads, on a GET, which is the one shape this rule can't protect. Ticket 08 changes them to read on GET and record on POST. Until it lands, each stack's `AGENTS.md` states the rule and the example breaks it; say so in the comments.

No option to allow other origins yet. Note it in the comments as the place one would go.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Every row of the table holds in every adapter and in Go, from the one shared file
- [ ] A refused write never reaches a handler
- [ ] A navigating POST with a lapsed token gets an HTML page, and following its link ends signed in on the page the form was on
- [ ] A navigating POST from a signed-out viewer on a gated app gets an HTML page that links to the hub's sign-in
- [ ] The whole-stack test posts to an app from a sibling app's origin and is refused, and the app's own page still posts
- [ ] The production test passes over https; the PR carries the `production` label
- [ ] `SECURITY.md` and each stack's `AGENTS.md` say what the guard refuses and what stays the app's job
- [ ] The PR's CI `gate` job passes on GitHub
