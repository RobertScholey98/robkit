# 02: Host-only cookies a sibling can't plant

**What to build:** A sibling subdomain can set `robkit_session=…; Domain=<domain>`, and the browser sends it to core and to every app beside the real cookie. Core and the guard both take the first token that verifies, so the planted one can win ([review](../research/review-2026-11-09.md), "A sibling app can shadow the session cookie"). A browser refuses a cookie whose name starts with `__Host-` unless it is `Secure`, has `Path=/` and names no `Domain`, so a sibling can't set one for another host.

- **The names.** On a hosted install, core's cookie and each app's cookie are `__Host-robkit_session`, and the guard's state cookie is `__Host-robkit_state`. A local install, where cookies go without `Secure`, keeps `robkit_session` and `robkit_state`. One function in `@robkit/session` gives the names for an install, and core, the guard and the Go port all use it or its port.
- **No fallback.** A hosted install doesn't read the plain names. A browser signed in before this change signs in once more. Say so in the changeset.
- **The first live token wins.** Where several values arrive under the name, which a local install still allows, core answers for the first whose session is live, and the guard answers `expired` only when no value holds a live token. `signOut` revokes the session of every core token it was sent.
- **The state is spent once.** The callback clears the state cookie in its answer, so a state read from a log can't be replayed.
- **A token must expire.** Both ports refuse a token with no `exp`.
- **Go does the same**, with the same names and the same order.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] On a hosted install core and the guard set and read only the `__Host-` names, with `Secure`, `Path=/` and no `Domain`; a local install's names and attributes are unchanged
- [ ] A request carrying an expired or foreign token before a live one is answered for the live one, in core, the guard and the Go port
- [ ] Core's `/logout` revokes every core session whose token it was sent
- [ ] The callback's answer clears the state cookie, and a second callback with the same state is refused
- [ ] A core-signed token with no `exp` is refused by both ports
- [ ] `SECURITY.md` says why the cookies carry the prefix, and the map's known gap about the old parent-domain cookie is updated
- [ ] The PR's CI `gate` job passes on GitHub
