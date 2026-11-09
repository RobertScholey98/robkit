# 08: Test a route as a viewer

**What to build:** An app's author has no way to test a route as the owner, as a guest with a role, or as nobody. A Go app can, with `session.WithViewer`. A Node app calls `guarded()` as its module loads, the helpers that build a viewer are in the private `@internal/test-session`, and no Node stack's template has a test or a `test` script. A professional kit ships the seam its users test through.

- **A `/testing` entry in each Node adapter.** `@robkit/hono/testing`, `@robkit/express/testing`, `@robkit/start/testing` and `@robkit/next/testing` each give a test what stands in for the guard in that stack, serving every request as the viewer the test names. For Hono and Express that is a guard to `use` in place of `guarded()`. For Start and Next it is whatever lets a test call a server function, a route handler or a page with a viewer; design each to fit how its stack is tested.
- **Viewers a test can build.** The same entry exports builders for the owner, a guest with roles, and nobody, so a test never casts to a branded id.
- **The main entry can't skip the guard.** No option, setting or environment variable on `guarded()` serves a request without checking it. The stand-in is reachable only through `/testing`, and each README says it is for tests.
- **Templates are shaped for it.** Each Node stack's template keeps its routes apart from the line that adds the guard, so a test mounts the routes behind the stand-in. Each gets a `test` script, Vitest, and one test that calls its page as the owner and as a guest. The Go stack keeps `session.WithViewer`.
- **Docs.** Each stack's `AGENTS.md` gains a short "Testing" section with the pattern, and each adapter's README documents its `/testing` entry.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Each Node adapter's `/testing` entry serves a request as the owner, as a guest with a role, and as nobody
- [ ] A test builds each kind of viewer with no cast
- [ ] Nothing on an adapter's main entry lets a request past without the guard, and a test says so
- [ ] Each Node stack's template has a `test` script and a test of its page as the owner and as a guest, which the install's `pnpm test` runs
- [ ] The whole-stack test's install checks pass with the new tests
- [ ] The API reports, READMEs and each stack's `AGENTS.md` cover the entry
- [ ] The PR's CI `gate` job passes on GitHub
