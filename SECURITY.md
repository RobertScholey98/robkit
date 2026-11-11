# Security

## Reporting a vulnerability

Please report a vulnerability privately, through GitHub's [private vulnerability reporting](https://github.com/RobertScholey98/robkit/security/advisories/new) for this repository. Don't open a public issue for it.

Say what you found, how to reproduce it, and what an attacker could do with it. robkit is pre-release and has no supported versions yet: fixes land on `main`.

## The trust model

An install trusts core, the hub, admin and the proxy in front of them. It trusts each app only with what that app needs to serve its own viewers. [docs/architecture.md](docs/architecture.md) shows the flows, and [docs/adr/](docs/adr/README.md) the reasons. Core's log holds no query parameters: a failed query is logged as its SQL with Postgres's code and names, so no access code, password hash or signing key reaches it.

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

### No guarded app can be framed from another origin

A page on a sibling subdomain is same-site, so a frame it puts admin or another app in carries the viewer's cookies, and a tricked click there acts as the viewer. So by default no guarded app, admin included, can be framed from another origin:

- Every answer the guard lets through, and each of its own pages, carries `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`.
- Core's answers, and the hub's, carry `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`, so nobody can frame core or the hub. The hub sends them from `servePage()` in `@robkit/serve`.
- On an https install, core, the hub and every guarded app send `Strict-Transport-Security: max-age=31536000`, a year, with no `includeSubDomains`, since the domain may hold hosts robkit doesn't run.
- The guard's and core's redirects carry no framing header. They keep `nosniff`, and HSTS on an https install. A redirect renders nothing, and an app that lets a framer in renews its token through those redirects inside the frame.

An app lets another origin frame it with its own `Content-Security-Policy: frame-ancestors`, which a browser obeys over `X-Frame-Options`. Each stack's `AGENTS.md` says how. An app's own `X-Frame-Options` isn't supported: on Next the guard's always wins, and on the other stacks the app's may.

What isn't covered:

- Files a stack serves without the guard, such as an app's built scripts and styles. They carry no framing header, and aren't pages.
- A window of its own. A sibling app can still open admin in a new window and time a double-click onto one of its own buttons, so the click lands in admin. These headers don't stop that, so don't read them as "admin's clicks are safe".

### Built files are public

An app's server answers its built client files, and the files in its `public` folder, before the guard runs, so anyone who can reach the app can fetch them. That is `/assets` on Hono and Express, `dist/client` on Start, and `/_next/static` on Next, whose `public` files go through the guard. Put nothing in the client's code or in `public` that a viewer shouldn't see.

`@robkit/serve` answers only the folders an adapter names. It never answers the rest of `dist`, such as the server's bundle or Vite's manifest, nor a URL that climbs out of a folder, encoded or not. It does follow a link inside a served folder, so the file a link points at is public too. Every file it answers carries `nosniff`.

### Core checks whole origins

Core knows its own origin from `ROBKIT_CORE_URL`, and works out every other address from it. It compares protocol, host and port, never the host alone:

- `/refresh` mints a token only when `next` is on the exact origin of admin or an app in core's catalog. It mints none for the hub or core.
- CORS lets exactly the hub's and admin's origins call core with the owner's cookie.
- Only a local install, on `localhost` or a name under it, runs over plain http. Core and every app refuse an http `ROBKIT_CORE_URL` on any other domain, since tokens travel in the URLs of `/refresh`'s redirects, and `pnpm dev` refuses a domain that isn't local.

### The hub asks before an intro link replaces a session

Any app on the install can send a viewer to an intro link, one of its own included. So the hub checks the session before it uses the link's code:

- A browser that isn't signed in signs in with the code, without a question.
- A browser that is signed in sees who it is signed in as, and is asked whether to sign in with the link instead. The hub sends core the code only on "yes". "No" leaves the session as it was.

The hub sends a browser on to `next` only on an app's exact origin, whether it just signed in or was signed in already. It forwards a tab to a given `next` once a visit, and notes where in its own `sessionStorage`, since the app that sends the browser back writes the address. A browser that comes back with the same `next` stays on the launcher, which says the app sent it back. A browser that won't let the hub read or keep the note stays on the launcher too, so only a person signing in sends it on.

### What an imported app can and can't do

An app the owner installs, whoever wrote it, can:

- Learn who each visitor is (their id, whether they are the owner or a guest, and their role ids) by sending them through core's `/refresh`. An app needs that to serve them.
- Read and write its own Postgres schema.
- Reach core over HTTP, as any visitor could.

It can't:

- Open admin or another app as the viewer. Its app token is good only for its own slug, and core never renews from it.
- Post to another app as the viewer from its own pages. The other app's guard refuses a write from another origin.
- Frame admin or another app in its own pages, unless that app's own policy names it. The other app's guard sends `X-Frame-Options: SAMEORIGIN`.
- Read core's tables or another app's schema. Its database role reaches its own schema and nothing else.

Three things hold an app, whatever its code does:

- Its database role, which reaches its own schema and nothing else.
- Its app token's audience, its own slug. No other app's guard accepts the token, and core never renews from it.
- Its container's environment, which holds its own `DATABASE_URL` and none of core's secrets.

Its image isn't one of them. The install's `Dockerfile` runs `turbo prune` for the app, which brings in every workspace package the app's `package.json` names.

`robkit check` is a lint, not a boundary. It reads the source of each app and shared package, and catches one that breaks the install's layer rule by mistake: an import of `@robkit/core` or another app, the session cookie read by name, or a relative import into a folder the check doesn't read. An app written to get past it can. So read an imported app's code before you install it.

The known ways past the lint:

- An import whose name is computed, such as `import(name)`.
- `createRequire`.
- An alias: tsconfig `paths`, a Vite `resolve.alias`, or a `package.json` `imports` entry.
- An absolute path, or a `file:` specifier.
- A symlinked file. The check reads the file, but works out its relative imports from the link's folder, and Node resolves them from the real file's.
- A folder's name in another case, such as `./Dist/server.js`, on a file system that ignores case, as macOS's does by default.
- A cookie name built from pieces, such as `"robkit_" + "session"`.

### robkit's own packages skip pnpm's one-day wait

pnpm holds back a version published in the last day while an older one fits. That gives the registry and the package's authors a day to notice and pull a version published by someone who took the package over. Where only the new version fits, pnpm takes it anyway by default, and refuses it once the install sets `minimumReleaseAge` or `minimumReleaseAgeStrict`.

An install's catalog names each of robkit's packages at one exact version, so only that version ever fits. Its `pnpm-workspace.yaml` exempts `@robkit/*` and `create-robkit` from the wait, in `minimumReleaseAgeExclude`. So an install made on the day of a release installs, under the strict setting too. Every other package still waits its day.

What that gives up: if someone took over robkit's npm packages and published a version, an install made or upgraded before anyone noticed would take it at once, with no day's wait. To keep the wait, delete the two entries from `minimumReleaseAgeExclude` and set `minimumReleaseAgeStrict: true`. An install then can't take a robkit release until it is a day old.

### Known gaps

The plan, `.scratch/kit/map.md`, lists the gaps we know of. The ones that bear on security:

- After sign-out, an app the browser opened in the last 15 minutes still lets it in until that app's token expires.
- Core hands an app its token in the callback's URL, so a proxy that logs URLs logs that app's token, good for 15 minutes on that app alone.
- Any container on Coolify's network can reach core directly and send its own forwarded headers. Only the owner's apps run there.
- Core's container starts with the Postgres admin URL and the database secret, from which every app's password comes. `robkit-core start` uses them to give each app its database, then serves core from a process whose environment holds neither, so nothing core logs or dumps of its own environment carries them. That is not a wall: code running in core's container can still read them from `/proc`. The statement that sets an app's role's password holds its SCRAM-SHA-256 verifier, not the password, and Postgres can log that verifier; whoever reads it can only guess against it offline, which a 64-character password derived from the database secret puts out of reach.
- Wrong access codes are limited to 20 an hour across the whole install, whatever addresses they come from. A generated code is 5 characters from 31, about 28.6 million codes. An attacker wants any live code, not one in particular, so trying them all takes about 163 years however many are live. With k codes live, the first hit is expected after about 28.6 million ÷ (k + 1) guesses: about 82 years with 1 live code, and about 8 years with 20, about a 12% chance of a hit in a year.
- What that costs: an attacker can stop new code sign-ins for up to an hour, and again for as long as they keep it up. Guests already signed in and the owner's password sign-in are unaffected.
- A 3-character code stays guessable in weeks. [Ticket 29](.scratch/just-use-it/issues/29-access-codes-at-least-five.md) takes that.
- Someone with many addresses can stop the owner signing in with the password for as long as they keep it up. Each request comes from a new client with a free place, so a steady flood keeps the queue of password checks full and the owner's right password gets 429. A browser that is already signed in is unaffected, because its session renews without the password. This is no worse than before, when the same flood queued checks without limit. [Ticket 31](.scratch/just-use-it/issues/31-password-sign-in-under-a-flood.md) asks whether to do more.
- With many addresses the limit per client stops counting, so the rate of password guesses is whatever the cap of 2 password checks at once allows.
- A hosted install's setup screen stays open until someone claims it. Claim it as soon as it's up.
- A state the guard keeps for a trip through core, if read from a log, is good until ten minutes after the last trip that renewed it, in the one browser that holds its cookie. The guard reuses the state a browser holds and renews its ten minutes on each trip, so tabs that share it all arrive.
- `GET /apps/:slug/access` answers anyone, since each app's guard reads its rule there with no cookie. So a stranger can learn which slugs an install has, and who may open each.
