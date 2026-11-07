# 02: Next.js

**What to build:** `next` becomes a ready stack: a Next.js App Router app, guarded by the install's session, through a new adapter, `@robkit/next`. Follow the checklist ticket 01 added to create-robkit's README.

- **Adapter.** The guard needs Node (`@robkit/session` loads `node:http`), so it can't run on the Edge runtime. Use a Node-runtime `proxy.ts` (or middleware). It runs the request guard and passes the viewer on to the app in a request header, after deleting any copy of that header the request came with. It exports a `viewer()` helper for server components, route handlers and server actions that reads that header. The helper is typed, and it throws a clear fault if the proxy didn't run. The adapter has the same published-package shape as `@robkit/hono`, conformance cases included.
- **A lapsed session.** Server actions are POSTs, and client navigations fetch RSC payloads with `sec-fetch-mode: cors`, so both get the guard's 401, not a 302. Find out what Next's client does with that 401. Make each case end at the hub's sign-in, or at core's refresh, and come back to the page, as `sessionFetch` does for Start. The whole-stack test proves it for a client navigation and for a server action.
- **Template.** `templates/stacks/next`: a page that says who is asking, records a visit through a server action or in the server component, and uses the UI kit. Plus `AGENTS.md`, `CLAUDE.md` and the scripts every stack has. Dev works behind the dev proxy on `<slug>.robkit.localhost` (`allowedDevOrigins`). The build lands in `dist` (`distDir`) so turbo's outputs and the Dockerfile find it. Telemetry is off. `dependencies` are exactly what the server needs at runtime, so the image's extraneous-packages check passes.
- **Choices, whole-stack test, production, docs:** as in ticket 01.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `@robkit/next` passes the guard's conformance cases and has the published-package shape
- [ ] init `--stack next` and `robkit add --stack next` make a working app, and both wizards offer it
- [ ] A lapsed session on a client navigation and on a server action goes to sign-in and returns, proven in the whole-stack test
- [ ] The generated app passes the install's lint, typecheck, test, format check and `robkit check`
- [ ] The whole-stack journeys pass for a Next install in the pull-request gate
- [ ] The production test serves a Next app over https
- [ ] The PR's CI `gate` job passes on GitHub
