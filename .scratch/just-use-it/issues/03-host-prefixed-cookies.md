# 03: Host-only cookies a sibling can't plant

**What to build:** A sibling subdomain can set `robkit_session=…; Domain=<domain>`, and the browser sends it to core and to every app beside the real cookie. Core and the guard both take the first token that verifies, so the planted one can win ([review](../research/review-2026-11-09.md), "A sibling app can shadow the session cookie"). A browser refuses a cookie whose name starts with `__Host-` unless it is `Secure`, has `Path=/` and names no `Domain`, so a sibling can't set one for another host, and only one can arrive.

- **The names.** Where the install's origin is https, core's cookie and each app's cookie are `__Host-robkit_session`, and the guard's state cookie is `__Host-robkit_state`. Where it is http, which is only ever a local install, they stay `robkit_session` and `robkit_state`, because the prefix needs `Secure`.
- **The protocol decides, not the domain.** `Secure` and the names follow the protocol of the install's origin, which the guard knows after ticket 01 and core after ticket 02. `isLocal(domain)` stops deciding either.
- **One place gives the names.** A function in `@robkit/session` takes the origin and gives the names and attributes. Core, the guard and the Go port use it or its port.
- **No fallback.** An https install doesn't read the plain names. A browser signed in before this change signs in once more. Say so in the changeset.
- **The callback clears the state cookie.** A browser that has finished a trip no longer holds its state, so a callback link built from a logged state finds no cookie to match.
- **A token must expire.** Both ports refuse a token with no `exp`.
- **Go does the same**, with the same names.

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] With an https origin, core and the guard set and read only the `__Host-` names, with `Secure`, `Path=/` and no `Domain`
- [ ] With an http origin the names and attributes are what they are today
- [ ] A request to an https install that carries only the plain-named cookie is treated as carrying none
- [ ] The callback's answer clears the state cookie, and a callback that arrives without it is refused
- [ ] A core-signed token with no `exp` is refused by both ports
- [ ] `SECURITY.md` says why the cookies carry the prefix, and the map's known gap about the old parent-domain cookie is removed
- [ ] The PR's CI `gate` job passes on GitHub
