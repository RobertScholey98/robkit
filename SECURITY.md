# Security

## Reporting a vulnerability

Please report a vulnerability privately, through GitHub's [private vulnerability reporting](https://github.com/RobertScholey98/robkit/security/advisories/new) for this repository. Don't open a public issue for it.

Say what you found, how to reproduce it, and what an attacker could do with it. robkit is pre-release and has no supported versions yet: fixes land on `main`.

## The trust model

An install trusts core, the hub, admin and the proxy in front of them. It trusts each app only with what that app needs to serve its own viewers. [docs/architecture.md](docs/architecture.md) shows the flows, and [docs/adr/](docs/adr/README.md) the reasons.

### Only the proxy reaches core

Core counts sign-in attempts per visitor, and it learns each visitor's address from the proxy's `X-Forwarded-For`, or `CF-Connecting-IP` when `ROBKIT_TRUSTED_PROXY=cloudflare`. Anything that can reach core directly can forge those headers, so core listens on 127.0.0.1 unless `HOST` is set, and in production nothing but the proxy, or a Cloudflare tunnel, should reach the host. See [ADR 0012](docs/adr/0012-only-the-proxy-reaches-core.md).

### Each app holds only its own token

Core signs every session token with an Ed25519 key that only core holds. No cookie goes on the parent domain:

- Core's own token sits in a host-only cookie on core's host. Core reads no other, and renews sessions only from it.
- Each app, admin included, holds its own app token, with its slug as the audience, in a host-only cookie on its own host. Its guard accepts no other token.

See [ADR 0004](docs/adr/0004-per-app-tokens.md).

### No sibling app can plant a session cookie

A browser treats every subdomain of an install as the same site, so an app on one subdomain can set a cookie with `Domain=<domain>`, and the browser sends it to core and to every other app beside the real one. On an https install each session cookie, core's and every app's, and the guard's state cookie, is named with the `__Host-` prefix: `__Host-robkit_session` and `__Host-robkit_state`. A browser sets a `__Host-` cookie only when it is `Secure`, has `Path=/` and names no `Domain`, so no app can set one for another host. Core and the guard read only the prefixed names there, and match a name exactly, so a name in another case, or with a no-break space before it, isn't read.

This holds for an https install, in a browser that refuses a cookie with no name whose value starts with `__Host-`, as the cookie standard's current draft (RFC 6265bis) asks. Such a cookie goes out in the `Cookie` header looking like the real one, so a browser that accepted it from a sibling would deliver it. An http install, which is only ever a local one, keeps the plain names, since the prefix needs `Secure`.

### No sibling app can write as the viewer

`SameSite=Lax` sends an app's cookie with a form posted from any sibling subdomain, because a browser counts every subdomain of an install as one site. So the guard refuses a write from another origin with a plain-text 403, before it reads the session and before any handler runs. The rule covers the guard's own paths under `/_robkit/` too.

- GET, HEAD and OPTIONS pass. Every other method is a write.
- A browser can't forge `Sec-Fetch-Site`, so when a write carries it, it decides: `same-origin` and `none` pass, and anything else is refused, whatever `Origin` says.
- In a browser that sends no fetch metadata, `Origin` decides: absent or the app's own origin passes, and anything else is refused.
- A server or a script that sends neither header passes. It carries no cookie the viewer didn't give it.
- A WebSocket handshake that reaches the guard is judged by `Origin` alone, since browsers disagree on the fetch metadata they send with one.

What stays the app's job:

- A GET with side effects. A link or an image on another app can send one, and the rule can't tell it from the viewer's own. Change state only on POST, PUT, PATCH or DELETE. Each stack's `AGENTS.md` says so, and names where that stack makes a GET easy to miss.
- A WebSocket the guard never sees. Go's guard sees every handshake. On the Node stacks a socket is usually upgraded outside the framework's middleware, where the guard doesn't run, so the app must check `Origin` itself.
- Allowing another origin to write. There's no option for it yet.

### Core checks whole origins

Core knows its own origin from `ROBKIT_CORE_URL`, and works out every other address from it. It compares protocol, host and port, never the host alone:

- `/refresh` mints a token only when `next` is on the exact origin of admin or an app in core's catalog. It mints none for the hub or core.
- CORS lets exactly the hub's and admin's origins call core with the owner's cookie.
- Only a local install, on `localhost` or a name under it, runs over plain http. Core and every app refuse an http `ROBKIT_CORE_URL` on any other domain, since tokens travel in the URLs of `/refresh`'s redirects, and `pnpm dev` refuses a domain that isn't local.

### What an imported app can and can't do

An app the owner installs, whoever wrote it, can:

- Learn who each visitor is (their id, whether they are the owner or a guest, and their role ids) by sending them through core's `/refresh`. An app needs that to serve them.
- Read and write its own Postgres schema.
- Reach core over HTTP, as any visitor could.

It can't:

- Open admin or another app as the viewer. Its app token is good only for its own slug, and core never renews from it.
- Post to another app as the viewer from its own pages. The other app's guard refuses a write from another origin.
- Read core's tables or another app's schema. Its database role reaches its own schema and nothing else.
- Import `@robkit/core`, another app, or read the session cookie itself, if it keeps to the install's layer rule. `robkit check` enforces that rule on the source, so review an imported app's code before you trust it beyond that.

### Known gaps

The plan, `.scratch/kit/map.md`, lists the gaps we know of. The ones that bear on security:

- After sign-out, an app the browser opened in the last 15 minutes still lets it in until that app's token expires.
- Core hands an app its token in the callback's URL, so a proxy that logs URLs logs that app's token, good for 15 minutes on that app alone.
- Any container on Coolify's network can reach core directly and send its own forwarded headers. Only the owner's apps run there.
- The sign-in limit is soft: two attempts racing in parallel can both get past it.
- A hosted install's setup screen stays open until someone claims it. Claim it as soon as it's up.
- A state the guard keeps for a trip through core, if read from a log, is good until ten minutes after the last trip that renewed it, in the one browser that holds its cookie. The guard reuses the state a browser holds and renews its ten minutes on each trip, so tabs that share it all arrive.
- The hub signs a browser in with whatever access code an intro link carries, without asking, even when someone is already signed in. So an app on a sibling subdomain can send a viewer to an intro link of its own and swap their session for a guest's. [Ticket 27](.scratch/just-use-it/issues/27-templates-finished.md) makes the hub ask first.
- `GET /apps/:slug/access` answers anyone, since each app's guard reads its rule there with no cookie. So a stranger can learn which slugs an install has, and who may open each.
