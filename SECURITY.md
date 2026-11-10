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
- Read core's tables or another app's schema. Its database role reaches its own schema and nothing else.
- Import `@robkit/core`, another app, or read the session cookie itself, if it keeps to the install's layer rule. `robkit check` enforces that rule on the source, so review an imported app's code before you trust it beyond that.

### Known gaps

The plan, `.scratch/kit/map.md`, lists the gaps we know of. The ones that bear on security:

- After sign-out, an app the browser opened in the last 15 minutes still lets it in until that app's token expires.
- Core hands an app its token in the callback's URL, so a proxy that logs URLs logs that app's token, good for 15 minutes on that app alone.
- Any container on Coolify's network can reach core directly and send its own forwarded headers. Only the owner's apps run there.
- Wrong access codes are limited to 20 an hour across the whole install, whatever addresses they come from. A generated code is 5 characters from 31, about 28.6 million codes. An attacker wants any live code, not one in particular, so trying them all takes about 163 years however many are live. With k codes live, the first hit is expected after about 28.6 million ÷ (k + 1) guesses: about 82 years with 1 live code, and about 8 years with 20, about a 12% chance of a hit in a year.
- What that costs: an attacker can stop new code sign-ins for up to an hour, and again for as long as they keep it up. Guests already signed in and the owner's password sign-in are unaffected.
- A 3-character code stays guessable in weeks. [Ticket 29](.scratch/just-use-it/issues/29-access-codes-at-least-five.md) takes that.
- Someone with many addresses can stop the owner signing in with the password for as long as they keep it up. Each request comes from a new client with a free place, so a steady flood keeps the queue of password checks full and the owner's right password gets 429. A browser that is already signed in is unaffected, because its session renews without the password. This is no worse than before, when the same flood queued checks without limit. [Ticket 31](.scratch/just-use-it/issues/31-password-sign-in-under-a-flood.md) asks whether to do more.
- With many addresses the limit per client stops counting, so the rate of password guesses is whatever the cap of 2 password checks at once allows.
- A hosted install's setup screen stays open until someone claims it. Claim it as soon as it's up.
- A state the guard keeps for a trip through core, if read from a log, is good until ten minutes after the last trip that renewed it, in the one browser that holds its cookie. The guard reuses the state a browser holds and renews its ten minutes on each trip, so tabs that share it all arrive.
- The hub signs a browser in with whatever access code an intro link carries, without asking, even when someone is already signed in. So an app on a sibling subdomain can send a viewer to an intro link of its own and swap their session for a guest's. [Ticket 27](.scratch/just-use-it/issues/27-templates-finished.md) makes the hub ask first.
- `GET /apps/:slug/access` answers anyone, since each app's guard reads its rule there with no cookie. So a stranger can learn which slugs an install has, and who may open each.
