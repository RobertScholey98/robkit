# 05: The guard refuses a cross-origin write

**What to build:** `SameSite=Lax` sends an app's cookie with a form posted from any sibling subdomain, because a browser counts subdomains of one domain as the same site. So a page on `evil.<domain>` can post to `notes.<domain>/api/…` and the handler runs as the viewer ([review](../research/review-2026-11-09.md), "A sibling app can act on another app as the viewer"). The guard already stands in front of every request, and after ticket 01 it knows the app's own origin, so it can refuse these before a handler runs.

- **Which requests.** A request whose method is GET, HEAD or OPTIONS passes as today. Every other method is a write. A WebSocket handshake that reaches the guard is checked too, by a rule of its own below.
- **The rule for a write.** A browser can't forge `Sec-Fetch-Site`, so when it is present it decides, whatever `Origin` says:

  | `Sec-Fetch-Site`                                                  | `Origin`                         | The guard    |
  | ----------------------------------------------------------------- | -------------------------------- | ------------ |
  | exactly `same-origin` or `none`                                   | any                              | passes       |
  | anything else: a list, an unknown word or an empty value included | any                              | refuses, 403 |
  | absent                                                            | absent                           | passes       |
  | absent                                                            | the app's own origin             | passes       |
  | absent                                                            | anything else, `null` or garbage | refuses, 403 |

  The 403 is plain text that says why, sent before the guard reads the session.
- **The rule for a WebSocket handshake.** `Origin` alone decides: absent or the app's own origin passes, and anything else is refused with 403. Browsers always send `Origin` on a handshake, but they don't agree on whether it carries fetch metadata, or on what `Sec-Fetch-Site` says there. The Go stack's dev server passes Vite's hot-update socket through the guard (`dev.go`), so a rule that read `Sec-Fetch-Site` could break `pnpm dev` in one browser and not another.
- **Clients that aren't browsers still work.** A server or a script sends neither header and carries no cookie the viewer didn't give it.
- **Both ports.** `requestGuard` and Go's `Guarded` refuse the same requests. The cases go in `tooling/test-session/request-cases.json`, the shared file ticket 01 made, as a new kind.
- **A form post that can't go through.** A POST that is a navigation (`Sec-Fetch-Mode: navigate`) and meets a lapsed token, or a signed-out viewer on a gated app, gets a small HTML page, not the JSON 401 a `fetch` gets. The page links to `/_robkit/refresh`, or to the hub's sign-in, with `next` set to the page the form was on: the `Referer`, when it is a page on the app's own origin and not under `/_robkit/`, and the app's `/` otherwise. The page goes out with status 401 and escapes the link it prints. For a signed-out viewer it also carries the `Set-Cookie` that forgets core's word that nobody is signed in, as today's redirect to the hub does, so the viewer isn't sent round again after signing in.
- **What it doesn't cover, said plainly.** `SECURITY.md` says the guard refuses cross-origin writes, that a GET with side effects is the app's own lookout, and that in a stack whose WebSocket upgrades never reach the guard the app must check `Origin` itself. Each stack's `AGENTS.md` says to change state only on POST, PUT, PATCH or DELETE, and names its own gaps. Start's is the sharpest: `createServerFn()` is a GET unless told otherwise, so every server function that changes state must say `method: "POST"`.

The react-hono and Express examples record a visit as their page loads, on a GET, which is the one shape this rule can't protect. The Go, Next and Start examples already post. Ticket 08 changes the first two to read on GET and record on POST. Until it lands, their `AGENTS.md` states the rule and the example breaks it; say so in the comments.

No option to allow other origins yet. Note it in the comments as the place one would go.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Every row of the table holds in every adapter and in Go, from the one shared file
- [ ] A refused write never reaches a handler
- [ ] A WebSocket handshake with another origin's `Origin` is refused whatever its `Sec-Fetch-Site`, and one with the app's own origin passes whatever its `Sec-Fetch-Site`; the Go stack's page still reloads on an edit under `pnpm dev`
- [ ] A navigating POST with a lapsed token gets an HTML page with status 401, and following its link ends signed in on the page the form was on
- [ ] A navigating POST from a signed-out viewer on a gated app gets an HTML page that links to the hub's sign-in and forgets the signed-out mark
- [ ] A `Referer` that holds markup arrives escaped in the page, or isn't used
- [ ] The whole-stack test posts to an app from a sibling app's origin and is refused, and the app's own page still posts, on the Go, Next and Start examples, which post today
- [ ] The production test passes over https; the PR carries the `production` label
- [ ] `SECURITY.md` and each stack's `AGENTS.md` say what the guard refuses and what stays the app's job
- [ ] The PR's CI `gate` job passes on GitHub
