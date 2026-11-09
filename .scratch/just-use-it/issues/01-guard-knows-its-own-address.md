# 01: The guard knows its own address

**What to build:** The guard works out the app's public origin from its settings and stops reading it from the request. Today `publicUrl` in `packages/session/src/guard-http.ts` takes the host from the request's URL and the protocol from `X-Forwarded-Proto`, and each adapter builds that URL from the `Host` header. A proxy hop that rewrites either header changes where the guard sends the browser, and the review found three faults that follow from it ([review](../research/review-2026-11-09.md), "The guard trusts `Host`").

- **One origin, from settings.** An app's public origin is `coreInstall(core).origin(app)`: core's protocol and port, on `<app>.<domain>`. `requestGuard` works it out once. Every URL the guard builds (the `next` it sends to core and the hub, the callback, `/_robkit/refresh`) is that origin plus the request's path and query.
- **No header decides the address.** Neither port reads `Host`, `X-Forwarded-Host` or `X-Forwarded-Proto` for it. `publicUrl`'s protocol read goes.
- **Adapters hand over a path.** The adapters that build the request's URL themselves, Express and Next, stop building it from `Host`. A request for `//evil.com/x` stays a path on the app. A request with no `Host`, or an empty one, is guarded like any other, so Express's 400 for an HTTP/1.0 request goes.
- **Go does the same.** `go/session` builds its URLs the same way, from `ReadGuardEnv`'s options.
- **Docs.** `docs/architecture.md` and `@robkit/session`'s README say where the guard's address comes from. The deploy runbook loses any advice that exists only because the guard read a forwarded header.

**Blocked by:** none

**Status:** done

- [x] In both ports, a request with a forged `Host`, `X-Forwarded-Host` or `X-Forwarded-Proto` gets the same `next` and the same redirects as one without
- [x] An https install whose last proxy hop is plain http sends `next` as `https://<app>.<domain>/…`
- [x] The Express and Next adapters guard `//evil.com/_robkit/refresh?next=…` as a path on the app, and a request with no `Host` or an empty one without throwing
- [x] The cases above are in the shared conformance file, or in one table both ports' tests read, so the two can't drift
- [x] `docs/architecture.md` and the session package's README say the address comes from settings
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

Chosen in the build, awaiting R's review.

- **`appOrigin(options)` is a new export of `@robkit/session`.** It is `coreInstall(core).origin(app)`. `requestGuard` works it out once and builds every URL from it plus the request's path and query (`publicUrl` in `guard-http.ts`). The Express and Next adapters need the same origin to build the request they hand the guard, and Express doesn't depend on `@robkit/input` at runtime, so session exports it rather than each adapter repeating the formula. The API report has it.
- **The guard reads only the path and query of the `Request` it gets.** An adapter may build that `Request` on any origin. Hono and Start still pass the server's request as it is.
- **Express keeps the request line as a path.** It puts `req.originalUrl`'s path and query on `appOrigin` with the URL setters, not by resolving it against a base, so `//evil.com/x` stays a path. An absolute-form target such as `http://evil.com/x` becomes the path `/http://evil.com/x` on the app rather than a throw. No `Host` is read, so its 400 for an HTTP/1.0 request without one is gone.
- **Next builds the page a server action returns to the same way.** `publicRequest` puts Next's path and query on `appOrigin`, and `forServerAction` reads `next` from that request, so its `x-action-redirect` names the app's origin whatever `Host` or `X-Forwarded-Proto` the proxy sent. Its 400 for a request without `Host` is gone too.
- **Go does the same.** `Guarded` works the origin out of `Options` once, as it already did for the hub, and `publicURL` takes the request's path and query only. It no longer reads `r.Host`, `r.TLS` or `X-Forwarded-Proto`, and no longer answers 400 to a request whose `Host` is missing or empty.
- **The shared cases live in a second file, `tooling/test-session/request-cases.json`, not in `packages/guard/conformance.json`.** The guard's file holds the pure decision table, rule by session to outcome, and ships with `@robkit/guard`. These cases are about the request: headers, the request line and where the browser goes. They need the fake core and the session test helpers, which live in `@internal/test-session`, and keeping them there leaves session's build and published API alone. The file is an object with one list per kind of case; this ticket adds `address`. `@internal/test-session` reads it (`addressCases`, `addressCookie`, `addressAnswer`), and `go/internal/conformance` reads the same file (`AddressCases`). `@robkit/session`'s tests, the Express and Next adapters' tests and `go/session`'s tests each run every row.
- **The tests' fake cores name a page beside core on its port.** The guard now puts the app on core's port, as the dev proxy does, so a page at `:3000` beside a fake core on a random port no longer matched. The first two commits move the TS and Go tests to `core.page` / `core.Page` with no behaviour change, so the later diffs show only what the ticket changed.
- **Two old tests changed meaning.** "keeps the public scheme the proxy saw" (TS and Go) now sends no `X-Forwarded-Proto` and says the https install keeps its pages on https. Next's "sends a server action back to the page over https when the proxy in front says so" became "keeps a server action on the app's origin when a request says https".
- **The deploy runbook needed no change.** Its proxy advice (http domains with force-HTTPS off behind a tunnel, `trustedProxy`) is about Coolify's routing and core's sign-in limit, not the guard. `robkit deploy` already sets `ROBKIT_CORE_URL` over https (`deployment.ts`), which is now the only thing that makes the guard's URLs https.

### Proof

- Red first. With the guard unchanged, all 11 address cases failed in `@robkit/session` (`ignores a forged Host` got `next=http://evil.com/notes?x=1`) and in `go/session`. With the new guard and the old adapters, Express failed its 3 adapter cases (the `//evil.com` target, no `Host`, empty `Host`), and Next failed 4 (those 3 and the https server action). The lapsed server-action test failed on the old Next adapter with `next=https://evil.com/notes?x=1` in both the refresh and the login redirect.
- On Windows: `@robkit/session` 114 tests and its type tests, `@robkit/express` 38, `@robkit/next` 56, `@robkit/hono` 26, `@robkit/start` 27, `@internal/test-session` 43 at 100% statements, and `go test ./...` passed, with lint and `gofmt` clean.
- On Windows, `pnpm check` failed three repo checks: `published.test.ts` found no `dist` for any package, core and create-robkit included, and `changeset-config.test.ts` and `doc-examples.test.ts` timed out. They failed alone too. I didn't run them on the base commit on Windows.
- In WSL, `pnpm check:all` ran the format check, knip, and every package's lint, typecheck and build, and the tests of session, express, hono, start, guard, input, react, test-session, eslint-config and Go: all passed. It stopped before the rest. `@internal/test-postgres` failed with `spawnSync ps ENOBUFS`, alone too: another worker's checkout had `sleep 600` processes with 100 KB environment variables running, so `ps axeww` printed 2.7 MB, past `execFileSync`'s 1 MB buffer. My branch doesn't touch that package. On the rerun, Docker's CLI segfaulted on every call, `docker version` included.
- GitHub's `gate` is the judge for the suites WSL didn't finish: core, dev, create-robkit, repo-checks, next and the whole-stack test.

### Not verified

- A real Coolify behind a Cloudflare tunnel. The "last hop is plain http" case runs in each port's tests, not on a host.
- The production test (`test:production`). This PR isn't labelled `production`.
- What Next's own server hands the proxy for a request line such as `//evil.com/x`. The adapter tests build that `NextRequest` themselves. Whatever Next makes of it, the adapter keeps only the path and query, so it stays on the app's origin.

### For other tickets

- **The app's origin.** Inside `requestGuard` it is the `origin` constant, beside `core` and `hub`; outside, `appOrigin(options)`. In Go it is `requestGuard.origin` (a `*url.URL`). Ticket 03 can take the `__Host-` decision from its protocol (`new URL(origin).protocol === "https:"`, Go's `g.origin.Scheme == "https"`); today `secure` still comes from `isLocal(domain)`. Ticket 05 compares `Origin` and `Sec-Fetch-Site` against it.
- **Shared request cases: `tooling/test-session/request-cases.json`.** Shape: `{ "<kind>": [row, ...], ... }`. Today there is one kind, `"address"`, whose rows are `{ name, core, target, headers, signedOut?, next }`: a page load on `example`, owner-only, the request line `target`, exactly `headers` (no `host` key sends none), and the `next` the guard must send core (or the hub, with `signedOut`). To add a kind, such as `"cookies"` (03), `"writes"` (05) or `"headers"` (06):
  1. Add the key and its rows to the JSON.
  2. In `tooling/test-session/src/request-cases.ts`, add the row type and a reader, add the key to `RequestCases` and `readRequestCases`, and export the list from `index.ts`, with tests in `index.test.ts` (the package holds 100% statement coverage).
  3. In `go/internal/conformance/request.go`, add the field to the struct `AddressCases` unmarshals into, or a sibling reader for the new key.
  4. Run the rows in `packages/session/src/request-guard.test.ts` and `go/session/guarded_test.go`, and in an adapter's tests where the adapter builds or changes the answer (Express and Next build the request; Next rewrites a server action's 401).
- **Adapters that build URLs.** Only Express and Next build a URL for the guard. Next has a second place, `forServerAction`, which builds the server action's redirect from the request the guard read; it is covered by "sends a lapsed server action to a page on the app's origin, whatever Host and X-Forwarded-Proto say". Hono and Start pass the request through and send the guard's answer as it is. `@robkit/react`'s `sessionFetch` sets `next` from the browser's own `location`.
- **`@internal/test-postgres`** reads `ps axeww` with `execFileSync`'s default 1 MB buffer, so a machine with a few processes carrying large environments fails its tests. Ticket 26 may want a `maxBuffer`.
- **Windows.** `corepack pnpm` works, but turbo calls whatever `pnpm` is first on `PATH`; here that was a global pnpm of another version, which fails the build with `ERR_PNPM_BAD_PM_VERSION`. `corepack enable --install-directory <folder> pnpm` from PowerShell, with that folder first on `PATH`, fixed it. Git Bash's path conversion breaks the same command.

### Merged

Added by the lead. PR 76 merged into `m1-the-subdomain-boundary` on 2026-11-09, with `gate` green on `a6c8da6`. That run was the first full gate on this branch, since the build's own run in WSL didn't finish.
