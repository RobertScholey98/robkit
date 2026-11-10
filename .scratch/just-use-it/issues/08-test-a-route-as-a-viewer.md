# 08: Test a route as a viewer

**What to build:** An app's author has no way to test a route as the owner, as a guest with a role, or as nobody. A Go app can, with `session.WithViewer`. A Node app calls `guarded()` as its module loads, the helpers that build a viewer are in the private `@internal/test-session`, every example page writes to Postgres as it loads, and no Node stack's template has a test or a `test` script. A professional kit ships the seam its users test through, and examples worth copying.

- **Viewers a test can build.** Each Node adapter gains a `/testing` entry that exports builders for the owner, a guest with roles, and nobody, so a test never casts to a branded id. The builders are written once, in a `/testing` entry of `@robkit/guard`, where the viewer's types live, and each adapter re-exports them, so an app's author imports from the one package they already use.
- **Hono and Express: a stand-in for the guard.** `@robkit/hono/testing` and `@robkit/express/testing` also export a guard to `use` in place of `guarded()`, which serves every request as the viewer the test names.
- **Next and Start: test the function, not the request.** Next's `viewer()` reads the request's headers and Start's server functions need Start's compiler, so neither runs under Vitest without faking the stack. Their `/testing` entries export the builders only. The pattern is the page's: it reads the viewer once and hands it to a plain function, and the test calls that function with a built viewer.
- **The main entry can't skip the guard.** No option, setting or environment variable on `guarded()` serves a request without checking it. The API report shows every option. The proof that counts is a test of behaviour: with `NODE_ENV=test`, and with `VITEST` set, each adapter's main `guarded()` still sends a request with no session where it sends one in production.
- **Examples read on GET and record on POST.** Today every example records a visit as its page loads: Hono's and Express's inside `GET /`, Start's from the page's loader, Next's in the page. Ticket 05's rule protects writes that aren't GETs, so the examples should show that shape: the page shows the count, and a button posts to record a visit. The Go stack's API already records with a POST. The whole-stack journeys that count visits change with it.
- **A test needs no database.** Each example's routes take what they store through as an argument, as the Go stack's `routes(page, record)` does, and the server file passes the real one. A test passes a stand-in. So the install's own CI, which has no Postgres, runs every template test.
- **Each Node stack gets a test.** A `test` script, Vitest, and one test that calls the page as the owner and as a guest. A stack's Vite config must not stop a test run for a missing guard setting, since Vitest loads it with no `pnpm dev` behind it.
- **Which config a test loads.** Say it for each stack. Prefer the stack's own `vite.config.ts`, so a test sees the app's plugins. Where a plugin won't load under Vitest, as Start's may not, give that stack a small `vitest.config.ts` and say why in it. Admin has an empty `vitest.config.ts` today only to dodge the guard check; ticket 10 removes it.
- **Docs.** Each stack's `AGENTS.md` gains a short "Testing" section with its pattern, and each adapter's README documents its `/testing` entry and says it is for tests.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Each Node adapter's `/testing` entry builds the owner, a guest with roles and nobody, with no cast in the test
- [ ] The Hono and Express stand-ins serve a request as each kind of viewer
- [ ] The builders are written once and every adapter's `/testing` gives the same ones
- [ ] The API report shows no option on an adapter's main entry that skips the guard, and with `NODE_ENV=test` or `VITEST` set each main `guarded()` still refuses a request with no session as it does in production
- [ ] Every example's page loads without a write, and its button records a visit with a POST; the whole-stack journeys pass
- [ ] Each Node stack's template has a `test` script and a test of its page as the owner and as a guest, which passes with no database and no `pnpm dev` running
- [ ] The whole-stack test's run of each install's own CI passes with the new tests
- [ ] The API reports, READMEs and each stack's `AGENTS.md` cover the entry and the pattern
- [ ] The PR's CI `gate` job passes on GitHub
