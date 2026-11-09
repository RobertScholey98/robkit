# 05: The guard refuses a cross-origin write

**What to build:** `SameSite=Lax` sends an app's cookie with a form posted from any sibling subdomain, because a browser counts subdomains of one domain as the same site. So a page on `evil.<domain>` can post to `notes.<domain>/api/…` and the handler runs as the viewer ([review](../research/review-2026-11-09.md), "A sibling app can act on another app as the viewer"). The guard already stands in front of every request, and after ticket 01 it knows the app's own origin, so it can refuse these before a handler runs.

- **Which requests.** A request whose method is GET, HEAD or OPTIONS passes as today. Every other method is a write. A WebSocket handshake that reaches the guard is checked too, by a rule of its own below. A handshake is a GET whose `Upgrade` header is `websocket`, in any case. A request with another method is a write whatever its `Upgrade` says.
- **The rule for a write.** A browser can't forge `Sec-Fetch-Site`, so when it is present it decides, whatever `Origin` says:

  | `Sec-Fetch-Site`                                                  | `Origin`                         | The guard    |
  | ----------------------------------------------------------------- | -------------------------------- | ------------ |
  | exactly `same-origin` or `none`                                   | any                              | passes       |
  | anything else: a list, an unknown word or an empty value included | any                              | refuses, 403 |
  | absent                                                            | absent                           | passes       |
  | absent                                                            | the app's own origin             | passes       |
  | absent                                                            | anything else, `null` or garbage | refuses, 403 |

  The 403 is plain text that says why, sent before the guard reads the session. The rule runs first on every path, the guard's own under `/_robkit/` included: a browser only ever reaches those by a GET.
- **The rule for a WebSocket handshake.** `Origin` alone decides: absent or the app's own origin passes, and anything else is refused with 403. Browsers always send `Origin` on a handshake, but they don't agree on whether it carries fetch metadata, or on what `Sec-Fetch-Site` says there. The Go stack's dev server passes Vite's hot-update socket through the guard (`dev.go`), so a rule that read `Sec-Fetch-Site` could break `pnpm dev` in one browser and not another.
- **Clients that aren't browsers still work.** A server or a script sends neither header and carries no cookie the viewer didn't give it.
- **Both ports.** `requestGuard` and Go's `Guarded` refuse the same requests. The cases go in `tooling/test-session/request-cases.json`, the shared file ticket 01 made, as a new kind.
- **A form post that can't go through.** Where a `fetch` gets the JSON 401 today, a POST that is a navigation (`Sec-Fetch-Mode: navigate`) gets a small HTML page with the same status. That is the only change. The guard decides who is asking exactly as it does now, and a POST still isn't a navigation when it does: `isBrowserNavigation` keeps covering only GET and HEAD. So an open app still hands a signed-out visitor's form to its handler as nobody, however old core's word that nobody is signed in.
  - **The page.** It says the form wasn't sent and has one link, to `/_robkit/refresh`, with `next` set to the page the form was on: the `Referer`, when it is a page on the app's own origin and not under `/_robkit/`, and the app's `/` otherwise. It escapes what it prints.
  - **Why one link is enough.** `/_robkit/refresh` asks core. If core knows the viewer, the browser comes back signed in on the form's page. If it doesn't, the browser comes back with core's word, and the GET that follows goes to the hub's sign-in as it does today. So the page needs no cookie of its own and no second link.
- **What it doesn't cover, said plainly.** `SECURITY.md` says the guard refuses cross-origin writes, that the rule leans on fetch metadata and falls back to `Origin` in a browser that sends none, that a GET with side effects is the app's own lookout, and that in a stack whose WebSocket upgrades never reach the guard the app must check `Origin` itself. Each stack's `AGENTS.md` says to change state only on POST, PUT, PATCH or DELETE, and names its own gaps. Start's is the sharpest: `createServerFn()` is a GET unless told otherwise, so every server function that changes state must say `method: "POST"`.

All four Node examples record a visit as their page loads, on a GET, which is the one shape this rule can't protect. react-hono and Express do it in the page's route. Next does it while `Home` renders, and Start's loader runs its server function on the server during the page's GET, whatever method the function declares. Only the Go example records on a POST alone. Ticket 08 changes the four to read on GET and record on POST. Until it lands, each one's `AGENTS.md` states the rule and the example breaks it; say so in the comments.

Go, Next and Start each also have a POST the page sends: Go's `POST /api/me`, Next's server action and Start's server function called from the browser. The whole-stack test uses those. It proves the rule on a POST. It doesn't prove the examples have no write a sibling can trigger.

No option to allow other origins yet. Note it in the comments as the place one would go.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Every row of the table holds in every adapter and in Go, from the one shared file
- [ ] A refused write never reaches a handler
- [ ] A WebSocket handshake with another origin's `Origin` is refused whatever its `Sec-Fetch-Site`, and one with the app's own origin passes whatever its `Sec-Fetch-Site`
- [ ] Under `pnpm dev`, a handshake sent to the Go example's own address with its own `Origin` gets Vite's 101, and one with a sibling's `Origin` gets 403. Vite's client can fall back to a socket of its own, so a page that reloads proves nothing here
- [ ] A POST to `/_robkit/session` or `/_robkit/refresh` from another origin is refused like any other write
- [ ] A request with `Upgrade: WebSocket` and a method other than GET is judged as a write
- [ ] A navigating POST with a lapsed token gets the HTML page with status 401, and following its link ends signed in on the page the form was on
- [ ] A navigating POST from a signed-out viewer on a gated app gets the same page, and following its link ends at the hub's sign-in with `next` set to the form's page
- [ ] A navigating POST from a signed-out visitor on an open app reaches the handler as nobody, with core's word fresh, older than a minute, or absent
- [ ] A `fetch` in each of those cases gets what it gets today
- [ ] A `Referer` that holds markup arrives escaped in the page, or isn't used
- [ ] The whole-stack test posts to an app from a sibling app's origin and is refused, and the app's own page still posts, on the Go, Next and Start examples, which post today
- [ ] The production test passes over https; the PR carries the `production` label
- [ ] `SECURITY.md` and each stack's `AGENTS.md` say what the guard refuses and what stays the app's job
- [ ] The PR's CI `gate` job passes on GitHub
