# 03: Host-only cookies a sibling can't plant

**What to build:** A sibling subdomain can set `robkit_session=…; Domain=<domain>`, and the browser sends it to core and to every app beside the real cookie. Core and the guard both take the first token that verifies, so the planted one can win ([review](../research/review-2026-11-09.md), "A sibling app can shadow the session cookie"). A browser refuses a cookie whose name starts with `__Host-` unless it is `Secure`, has `Path=/` and names no `Domain`, so a sibling can't set one for another host, and only one can arrive.

- **The names.** Where the install's origin is https, core's cookie and each app's cookie are `__Host-robkit_session`, and the guard's state cookie is `__Host-robkit_state`. Where it is http they stay `robkit_session` and `robkit_state`, because the prefix needs `Secure`. Ticket 02 makes an http install a local one, so this isn't a hole.
- **The protocol decides, not the domain.** `Secure` and the names follow the protocol of the install's origin, which the guard knows after ticket 01 and core after ticket 02. `isLocal(domain)` stops deciding either, in both ports.
- **One place gives the names.** A function in `@robkit/session` takes the origin and gives the names and attributes. Core, the guard and the Go port use it or its port.
- **No fallback.** An https install doesn't read the plain names. A browser signed in before this change signs in once more. Say so in the changeset.
- **A name matches exactly.** Both ports find a cookie by trimming only spaces and tabs around its name and comparing the rest exactly. Today Go's `strings.TrimSpace` and JavaScript's `trim()` strip other whitespace too, so a sibling could set a cookie whose name is a no-break space followed by `__Host-robkit_session`: a browser sees no prefix there and accepts its `Domain`, and the guard would read it as the real one.
- **Go's reader refuses plain http off localhost.** `ReadGuardEnv` in `go/session` accepts `http://core.example.com` today. It refuses an http origin unless the domain is local, as ticket 02 makes `readCoreUrl` do, from one shared table of cases.
- **`robkit check` follows the names.** Its rule against reading the session cookie takes the name from `@robkit/session` (`packages/create-robkit/src/check.ts`). Keep it matching both names.
- **A superseded state restarts the trip.** Two page loads that start together, such as two restored tabs, each get a state of their own, and the browser keeps only the last. Today the other tab's callback gets an error page. When a callback's state doesn't match the state cookie the browser holds, the guard stores nothing from it and sends the browser to `next`, which is already checked to be a page on the app, so it makes a clean trip with the state it holds. A callback from a browser that holds no state cookie still gets today's page that says it kept none. A token is never stored without a matching state.
- **The state keeps its ten minutes.** The review suggested clearing the state cookie once a trip ends. That breaks tabs that share a state, so it isn't done. Record in `SECURITY.md`'s known gaps that a state read from a log is good for ten minutes, in the one browser that holds its cookie.
- **A token must expire.** Both ports refuse a token with no `exp`.

Add this ticket's cases to the shared file ticket 01 names, so both ports run them.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] With an https origin, core and the guard set and read only the `__Host-` names, with `Secure`, `Path=/` and no `Domain`, in both ports
- [ ] With an http origin the names and attributes are what they are today
- [ ] A request to an https install that carries only the plain-named cookie is treated as carrying none
- [ ] A cookie whose name is `__Host-robkit_session` with a no-break space or U+2000 before it is ignored by both ports
- [ ] Go's reader refuses `http://core.example.com` and accepts `http://core.robkit.localhost:3000`
- [ ] Two page loads started together with no state cookie both end on their page, whichever callback lands first, in both ports
- [ ] A callback whose state doesn't match stores no token, and one with no state cookie gets the page that says the browser kept none
- [ ] A core-signed token with no `exp` is refused by both ports
- [ ] `robkit check` refuses an app that reads either cookie name
- [ ] The production test passes over https and asserts the `__Host-` names on core's and an app's cookies; the PR carries the `production` label
- [ ] `SECURITY.md` says why the cookies carry the prefix, that the guarantee is for an https install, and the state's ten minutes; the map's known gap about the old parent-domain cookie is removed
- [ ] The PR's CI `gate` job passes on GitHub
