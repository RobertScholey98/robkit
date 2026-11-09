# 03: Host-only cookies a sibling can't plant

**What to build:** A sibling subdomain can set `robkit_session=…; Domain=<domain>`, and the browser sends it to core and to every app beside the real cookie. Core and the guard both take the first token that verifies, so the planted one can win ([review](../research/review-2026-11-09.md), "A sibling app can shadow the session cookie"). A browser refuses a cookie whose name starts with `__Host-` unless it is `Secure`, has `Path=/` and names no `Domain`, so a sibling can't set one for another host, and only one can arrive.

- **The names.** Where the install's origin is https, core's cookie and each app's cookie are `__Host-robkit_session`, and the guard's state cookie is `__Host-robkit_state`. Where it is http they stay `robkit_session` and `robkit_state`, because the prefix needs `Secure`. Ticket 02 makes an http install a local one, so this isn't a hole.
- **The protocol decides, not the domain.** `Secure` and the names follow the protocol of the install's origin, which the guard knows after ticket 01 and core after ticket 02. `isLocal(domain)` stops deciding either, in both ports.
- **One place gives the names.** A function in `@robkit/session` takes the origin and gives the names and attributes. Core, the guard and the Go port use it or its port.
- **No fallback.** An https install doesn't read the plain names. A browser signed in before this change signs in once more. Say so in the changeset.
- **A name matches exactly.** Both ports find a cookie by trimming only spaces and tabs around its name and comparing the rest exactly, so a name in another case, such as `__HOST-robkit_session`, doesn't match either. Today both trim more. A sibling can set a cookie whose name is a no-break space followed by `__Host-robkit_session`: a browser sees no prefix there and accepts its `Domain`. A browser sends that name as UTF-8, the bytes `C2 A0` and then the name. Go's `strings.TrimSpace` reads UTF-8 and strips them, so the Go guard takes the cookie as the real one. Node reads header bytes as Latin-1, so JavaScript's `trim()` leaves `C2` in place and misses, but it would strip a lone `A0` byte.
- **The cases are bytes.** A JSON string can't carry these cases to both ports: `new Headers()` throws on U+2000. The shared file gives each `Cookie` header as bytes, in hex, and each runner hands them to its guard as its server would: Go as they are, TypeScript as the Latin-1 string Node makes of them. The cases put `A0`, `C2 A0` and `E2 80 80` before the name.
- **Go refuses plain http off localhost, however it gets the address.** `go/session` accepts `http://core.example.com` today. Put the rule in `isCoreOrigin`, which both `ReadGuardEnv` and `Guarded(Options{…})` call, so an address written in code is refused as one read from settings is. An http origin passes only when the domain is local, as ticket 02 made `readCoreUrl` do. For an http origin on a domain that isn't local, Go's message says what `readCoreUrl` says: that it is http on a domain that isn't local, and to serve the install over https. Both readers run one table of addresses: a new kind in `tooling/test-session/request-cases.json`, called `coreAddress`, since `address` is taken. Its rows are bare origins: `ReadGuardEnv` and `readCoreUrl` drop a path, but `Guarded(Options{…})` takes the exact origin, so a row with a path couldn't be judged alike. The table checks the verdict, not the words. Go's tests read it as they read the other kinds. On the TypeScript side `@internal/test-session`'s own tests run it against `readCoreUrl`, because that package already depends on `@robkit/input` and input's tests can't reach the file without a cycle.
- **The fakes take the name from the origin too.** The fake cores write the plain name today (`tooling/test-session/src/index.ts`, `go/internal/fakecore/fakecore.go`, `packages/core/src/test/fresh-app.ts`). Most shared cases use an https core, so each fake gets its names from the origin. `tooling/test-session` can't import `@robkit/session`, whose own tests use it, so it writes both names out and picks by the origin's protocol, and a test in `@robkit/session` fails if that copy and the real function disagree. Go's fake calls the Go port, and core's `fresh-app.ts` calls the function.
- **`robkit check` follows the names.** Its rule against reading the session cookie takes the name from `@robkit/session` (`packages/create-robkit/src/check.ts`). It matches the plain name and the prefixed one today, because one contains the other. Pin that with a test for each.
- **A superseded state restarts the trip.** Two page loads that start together, such as two restored tabs, each get a state of their own, and the browser keeps only the last. Today the other tab's callback gets an error page. When a callback's state doesn't match the state cookie the browser holds, the guard stores nothing from it and sends the browser to `next`, which is already checked to be a page on the app, so it makes a clean trip with the state it holds. That redirect leaves a URL that carries a token, so it sends `Referrer-Policy: no-referrer`, as the matching path does. A callback from a browser that holds no state cookie still gets today's page that says it kept none. A token is never stored without a matching state.
- **The state keeps its ten minutes.** The review suggested clearing the state cookie once a trip ends. That breaks tabs that share a state, so it isn't done. `toCore` reuses a state the browser holds and sends a fresh ten-minute `Max-Age` on each trip, in both ports. Record in `SECURITY.md`'s known gaps that a state read from a log is good until ten minutes after the last trip that renewed it, in the one browser that holds its cookie.
- **A token must expire.** Both ports refuse a token with no `exp`.
- **What the prefix rests on.** A cookie with no name and the value `__Host-robkit_session=x` goes out in the `Cookie` header looking like the real one. The cookie standard's current draft (RFC 6265bis) has a browser refuse a nameless cookie whose value starts with `__Host-`. Say in `SECURITY.md` that the guarantee holds in a browser that follows that rule, as the rule for writes holds in a browser that sends fetch metadata.
- **One gap stays until ticket 27.** The hub signs a browser in with whatever access code an intro link carries, without asking, even when someone is already signed in. So a sibling app can send a viewer to an intro link of its own and swap their session for a guest's. [Ticket 27](27-templates-finished.md) makes the hub ask first. Until then `SECURITY.md` lists it as a known gap, so nothing there reads as "a sibling can't touch the session".

Add this ticket's cases to `tooling/test-session/request-cases.json`, the shared file ticket 01 made, as a new kind, so both ports run them.

**Blocked by:** 01, 02

**Status:** done

- [x] With an https origin, core and the guard set and read only the `__Host-` names, with `Secure`, `Path=/` and no `Domain`, in both ports
- [x] With an http origin the names and attributes are what they are today
- [x] A request to an https install that carries only the plain-named cookie is treated as carrying none
- [x] A `Cookie` header with the bytes `A0`, `C2 A0` or `E2 80 80` before the name `__Host-robkit_session` is treated as carrying no session by both ports, from byte cases in the shared file
- [x] A cookie named `__HOST-robkit_session` is ignored by both ports
- [x] Go refuses `http://core.example.com` and accepts `http://core.robkit.localhost:3000`, from `ReadGuardEnv` and from `Guarded(Options{…})` alike, and `readCoreUrl` gives the same answers from the same table
- [x] Two page loads started together with no state cookie both end on their page, whichever callback lands first, in both ports
- [x] A callback whose state doesn't match stores no token and redirects with `Referrer-Policy: no-referrer`, and one with no state cookie gets the page that says the browser kept none
- [x] A core-signed token with no `exp` is refused by both ports
- [x] `robkit check` refuses an app that reads the session cookie by its plain name, and one that reads it by its prefixed name
- [ ] The production test passes over https and asserts the `__Host-` names on core's and an app's cookies; the PR carries the `production` label
- [x] `SECURITY.md` says why the cookies carry the prefix, that the guarantee is for an https install in a browser that refuses a nameless cookie posing as a prefixed one, the state's renewing ten minutes, and the intro-link gap that ticket 27 closes; the map's known gap about the old parent-domain cookie is removed
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### Amended by the lead after the council's sixth round

Written into the text above.

1. **The TypeScript fake writes the names out.** `tooling/test-session` can't import `@robkit/session` without a cycle, so it writes both names out and picks by protocol. A test in `@robkit/session` fails if the copy and `sessionCookies` disagree.
2. **The table of core addresses holds bare origins**, and its kind is `coreAddress`, since `address` is taken.
3. **The state's lifetime renews.** `toCore` reuses a held state and renews its ten minutes on each trip, so `SECURITY.md` says a state from a log is good until ten minutes after the last trip that renewed it.
4. **Go says why it refuses plain http** off a local domain, in `readCoreUrl`'s words.

### What I chose, and why

Chosen in the build.

- **`sessionCookies(origin)` returns `{ session, state, attributes }`.** `attributes` is `{ path: "/", httpOnly: true, sameSite: "Lax", secure }`, which core spreads into Hono's `setCookie` and the guard writes with `hostOnlyCookie`. Hono itself refuses a `__Host-` cookie that isn't `Secure` with `Path=/` and no `Domain`, so a mistake there throws.
- **`sessionTokensIn(cookieHeader, origin)` takes the origin.** A caller can't read the wrong name. It moved beside `sessionCookies`. Core's only callers pass `context.install.origin("core")`.
- **`sessionCookie` stays exported** as the name before any prefix. `robkit check` matches it, and the prefixed name contains it. Its doc says to use `sessionCookies` for what a browser holds.
- **Values are trimmed of spaces and tabs only, too**, not just names, in both ports, so name and value follow one rule.
- **The Go port is `go/internal/sessioncookies`**, not an export of `go/session`. The guard and the fake core both call it, and Go apps get no new API they shouldn't use.
- **The cookie byte cases probe with core's word that nobody is signed in**, not a token. Each row's cookie is a fixed `signed-out.1798761600` under some name, and each runner sets its clock to the row's `now` plus a second. An open app lets the browser in as nobody when the guard reads the cookie, and sends it to core when it doesn't. So neither port fetches keys from an https core it can't reach. Hex may have spaces between bytes, for reading.
- **Core's tests that only need a local domain run on `https://core.robkit.localhost:3443`**, where they don't test http. The test code works on a local domain whatever the protocol. Tests about http itself pass the origin to `claim`, `withSession`, `sessionCookieOf` and `refresh`.
- **A superseded callback goes through `toNext`**, the one place the guard sends the browser on to `next` with `Referrer-Policy: no-referrer`, in each port. The callback's success uses it too.
- **The production test reads every `robkit_` cookie the guest's browser holds** after opening an app, with its host and attributes: core's session cookie, and the app's session and state cookies. It checks them for the example and for the app on each other stack that `robkit add` deploys, the Go one included.

### Proof

- Red first, through public interfaces. The https guard tests got `robkit_state=` and `robkit_session=` where they expected `__Host-`, in both ports. Of the byte cases, the TS guard read the lone `A0` row as the session cookie, and the Go guard read the `C2 A0` and `E2 80 80` rows, as the ticket said. Go took all four http origins off a local domain from both `ReadGuardEnv` and `Guarded`, and read a token with no `exp` as the owner. Both ports answered a superseded callback with a 400, so one of two tabs ended on an error page in either order. Core's tests failed until core set `__Host-robkit_session`, and its new test found a plain-named cookie read on an https core.
- `robkit check` needed no change: both its tests passed first, as the ticket expected.
- In WSL, `pnpm check:all`: 61 of 61 tasks in 8 minutes. `@internal/e2e` 74 passed and 11 skipped of 85. After merging the milestone branch with ticket 26's fix, 61 of 61 again, with `@internal/e2e` 81 passed and 11 skipped of 92.
- On Windows, `pnpm check` with Go on `PATH`: 58 of 59 tasks. `create-robkit`'s `vendor.test.ts` failed 3 tests that pack a fake checkout, alone too. This branch doesn't touch `vendor.ts`, and the same tests passed in WSL's gate.

### Not verified

- The production test locally. Its first try in WSL stopped before any journey: Docker couldn't pull Caddy's image, since WSL had lost its interop registration and Docker Desktop's credential helper wouldn't run. After the lead restored it, the pull worked, but admin's image failed to build twice: rolldown's musl binding gave `Exec format error`. The second try reused the first's cached `pnpm install` layer. The milestone branch, on fresh layers, passed all 13 tests on the same machine, and this branch changes no package, lockfile or Dockerfile. CI's first run on this branch passed the example's journey with the `__Host-` names. The PR carries the `production` label, so CI runs it.
- A real browser refusing a nameless cookie whose value starts with `__Host-`. `SECURITY.md` names that as the condition the guarantee rests on.

### For other tickets

- **The names.** `sessionCookies(origin)` in `@robkit/session` (TS) and `sessioncookies.For(origin)` in `go/internal/sessioncookies` (Go). `@internal/test-session` has `sessionCookieOn(origin)` and `signedOutCookie(origin)`; the fake cores' `cookieFor` and `CookieFor` name their cookies from the core's origin. Core's `fresh-app.ts` exports `defaultOrigin`, and `withSession`, `sessionCookieOf` and `claim` take an origin.
- **New kinds in `tooling/test-session/request-cases.json`.** `cookies`: rows `{ name, core, cookie, now, reads }`, where `cookie` is the `Cookie` header's bytes in hex. TS reads it as `cookieCases` and hands a row to the guard with `cookieRequest(row)`, which gives the page and the header as Node's server makes it (each byte as a Latin-1 character), and checks `cookieAnswer(row)`. Go reads it with `conformance.CookieCases(t)`, which decodes the bytes into a string that Go's server would hand on as it is. `coreAddress`: rows `{ origin, accepted }`, bare origins, read as `coreAddressCases` and `conformance.CoreAddressCases(t)`. `readRequestCases` now needs every kind's list, so a ticket that adds a kind adds it to `listIn`'s callers and to the tests' literal files.
- **Ticket 06:** the guard's redirects are built by `redirect` in `packages/session/src/guard-http.ts` and `redirect` in `go/session/http.go`, one place each. `toNext` in `refresh-protocol.ts` and `refresh.go` adds `Referrer-Policy` on top.
- **Ticket 05:** the guard's cookies are `SameSite=Lax`, unchanged.
