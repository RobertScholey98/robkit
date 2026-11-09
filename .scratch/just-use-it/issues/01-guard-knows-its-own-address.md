# 01: The guard knows its own address

**What to build:** The guard works out the app's public origin from its settings and stops reading it from the request. Today `publicUrl` in `packages/session/src/guard-http.ts` takes the host from the request's URL and the protocol from `X-Forwarded-Proto`, and each adapter builds that URL from the `Host` header. A proxy hop that rewrites either header changes where the guard sends the browser, and the review found three faults that follow from it ([review](../research/review-2026-11-09.md), "The guard trusts `Host`").

- **One origin, from settings.** An app's public origin is `coreInstall(core).origin(app)`: core's protocol and port, on `<app>.<domain>`. `requestGuard` works it out once. Every URL the guard builds (the `next` it sends to core and the hub, the callback, `/_robkit/refresh`) is that origin plus the request's path and query.
- **No header decides the address.** Neither port reads `Host`, `X-Forwarded-Host` or `X-Forwarded-Proto` for it. `publicUrl`'s protocol read goes.
- **Adapters hand over a path.** The Express and Next adapters stop building an absolute URL from `Host`. A request for `//evil.com/x` stays a path on the app. A request with no `Host`, or an empty one, is guarded like any other, so Express's 400 for an HTTP/1.0 request goes too.
- **Go does the same.** `go/session` builds its URLs the same way, from `ReadGuardEnv`'s options.
- **Docs.** `docs/architecture.md` says where the guard's address comes from. `SECURITY.md` and the deploy runbook lose any advice that exists only because the guard read a forwarded header.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] In both ports, a request with a forged `Host`, `X-Forwarded-Host` or `X-Forwarded-Proto` gets the same `next` and the same redirects as one without
- [ ] An https install whose last proxy hop is plain http sends `next` as `https://<app>.<domain>/…`
- [ ] Each adapter guards `//evil.com/_robkit/refresh?next=…` as a path on the app, and a request with no `Host` or an empty one without throwing
- [ ] The cases above are in the shared conformance file, or in one table both ports' tests read, so the two can't drift
- [ ] `docs/architecture.md` and the guard's README say the address comes from settings
- [ ] The PR's CI `gate` job passes on GitHub
