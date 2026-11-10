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

**Status:** done

- [x] Every row of the table holds in every adapter and in Go, from the one shared file
- [x] A refused write never reaches a handler
- [x] A WebSocket handshake with another origin's `Origin` is refused whatever its `Sec-Fetch-Site`, and one with the app's own origin passes whatever its `Sec-Fetch-Site`
- [x] Under `pnpm dev`, a handshake sent to the Go example's own address with its own `Origin` gets Vite's 101, and one with a sibling's `Origin` gets 403. Vite's client can fall back to a socket of its own, so a page that reloads proves nothing here
- [x] A POST to `/_robkit/session` or `/_robkit/refresh` from another origin is refused like any other write
- [x] A request with `Upgrade: WebSocket` and a method other than GET is judged as a write
- [x] A navigating POST with a lapsed token gets the HTML page with status 401, and following its link ends signed in on the page the form was on
- [x] A navigating POST from a signed-out viewer on a gated app gets the same page, and following its link ends at the hub's sign-in with `next` set to the form's page
- [x] A navigating POST from a signed-out visitor on an open app reaches the handler as nobody, with core's word fresh, older than a minute, or absent
- [x] A `fetch` in each of those cases gets what it gets today
- [x] A `Referer` that holds markup arrives escaped in the page, or isn't used
- [x] The whole-stack test posts to an app from a sibling app's origin and is refused, and the app's own page still posts, on the Go, Next and Start examples, which post today
- [x] The production test passes over https; the PR carries the `production` label
- [x] `SECURITY.md` and each stack's `AGENTS.md` say what the guard refuses and what stays the app's job
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

Chosen in the build.

- **Two new kinds in `tooling/test-session/request-cases.json`.** `writes`: rows `{ name, core, method, target, headers, refused }`, a request to `example`, open to anyone, with no cookie and exactly `headers`. A row that passes reaches the handler as nobody. The table's rows, the guard's two paths, `PUT`, `PATCH`, `DELETE`, a method it doesn't know, a `POST` that asks for a WebSocket, the handshakes, and a local install are all there. `formPost`: rows `{ name, core, referer?, next }`, a navigating `POST` to `example`, owner-only, with no cookie, and the `next` its page must link back to. TS reads them as `writeCases` and `formPostCases`, with `writeRequest`, `writeAnswer`, `formPostRequest`, `formPostAnswer` and `linksIn`. Go reads them with `conformance.WriteCases(t)` and `conformance.FormPostCases(t)`.
- **Every adapter runs the `writes` rows**, with a flag in its handler, so a refused row proves the handler never ran. Express sends each row over a raw socket, since Node's client won't send an `Upgrade` without asking to switch.
- **`Origin` must equal the app's origin exactly.** A host in capitals, a trailing slash, another port or another protocol is refused.
- **A handshake is a GET whose `Upgrade` is exactly `websocket`, in any case.** Several `Sec-Fetch-Site` or `Origin` headers are read as one list, and refused.
- **The 403's text** is "This app only accepts changes from its own pages, and this request came from another origin.", in both ports, `text/plain` with `no-store`.
- **The form page shows for a `POST` with `Sec-Fetch-Mode: navigate`**, whatever its `Accept`. Only a form navigates with a `POST`. On `login` it still sends the cookie that forgets core's word, as the 401 does.
- **The guard uses a `Referer` only when it holds just the characters a URL allows, quotes excepted.** Go keeps a query as it arrives and JavaScript re-encodes it, so the two ports would disagree on a `Referer` a browser never sends. With that rule, markup in the path or the query falls back to the app's `/` in both. The link's `href` is escaped as well, though URL-encoding leaves nothing to escape.
- **The whole-stack journey replays the example's own POST.** It presses "Visit again", takes the POST the page made, and posts a form to the same address from the added app's page. It checks the browser said `same-site`, sent the example's cookie, and got the 403. The page's own POST got 200 in the same run. It runs where `describeJourneys` gets `posts: true`: Go, Next and Start. Go also gets `viteSocket: true`, which sends Vite's ping handshake through the dev proxy with the owner's cookie, once with the example's `Origin` and once with the added app's.

### Proof

- Red first, through public interfaces. With the guard unchanged, the 28 `writes` rows that should be refused failed in `@robkit/session` and in `go/session`, and the rows that pass already passed. The "before it reads the session" test failed in both. Every `formPost` row and the page's two round trips failed in both ports. The open-app and `fetch` tests passed before the change, as the ticket expects.
- The adapters' runners passed when added, since each hands the guard's answer on as it is. They pin that every row holds through each one, with no handler run.
- In WSL, `pnpm check:all`: 61 of 61 tasks in 6 minutes 30 seconds. `@internal/e2e` 85 passed and 17 skipped of 102. The cross-origin journey passed on Go, Next and Start, with the example's own POST answered 200, and the Vite socket check passed on Go. `check-coverage-ratchet.ts` passed after it, with no threshold to raise.
- In WSL, `test:production`: 13 of 13. The first run timed out building the other stacks' images on cold layers. A rerun without Go on `PATH` stopped at `robkit add go`, which was my setup. The third, with Go, passed every test.
- On Windows, `pnpm check` with Go on `PATH`: format, knip, lint, typecheck and every package's unit tests passed but one. `published.test.ts` in repo-checks found no `dist` in any packed package, core and create-robkit included, alone too, as ticket 01 saw. It passed in the WSL gate. create-robkit's unit tests were cut off by that failure; they passed in the WSL gate.

### Not verified

- The whole-stack journey against the old guard. I didn't run it red, so it proves the refusal holds, not that it would have caught the hole.
- A real browser's `Sec-Fetch-Site` on a WebSocket handshake. The rule doesn't read it there, and the unit rows cover both values.
- Firefox and Safari. The whole-stack test drives Chromium only.

### For other tickets

- **Ticket 06: where the guard builds its answers.** The 403 is built at the top of the function `requestGuard` returns, in `packages/session/src/request-guard.ts`, as `text(errors.elsewhere, 403)`, and at the top of `check` in `go/session/guarded.go`, as `text(errElsewhere, http.StatusForbidden)`. The rule is `isFromAnotherOrigin` in `guard-http.ts` and `http.go`. The form page is `formNotSent` in `guard-http.ts` and `http.go`, called from `respond` in TS and `check` in Go. Every answer the guard gives comes from `text`, `redirect`, `formNotSent` or the 401 (`sessionLapsedResponse`, Go's `sessionLapsed`).
- **Ticket 08: the examples break the rule today.** react-hono and Express record a visit in `GET /`. Next records one while `Home` renders. Start's loader runs its server function on the server during the page's GET, whatever method it declares. Each stack's `AGENTS.md` now says to change state only on POST, PUT, PATCH or DELETE, and Start's says a loader must change nothing, so until 08 lands those examples contradict their own docs. The cross-origin journey (`tooling/e2e/src/cross-origin-journey.ts`) presses "Visit again" and needs that button to keep posting. Once react-hono and Express post too, pass `posts: true` in their test files.
- **Allowing another origin.** There's no option yet. One would go on `GuardedOptions` and Go's `Options`, read by `isFromAnotherOrigin` in each port, with rows in the `writes` list.

### Merged

Added by the lead. PR 80 merged into `m1-the-subdomain-boundary` on 2026-11-10, with `gate` and the `production` job green on `bdc9110`, after ticket 04 was merged into it.
