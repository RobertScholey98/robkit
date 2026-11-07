# 02: Next.js

**What to build:** `next` becomes a ready stack: a Next.js App Router app, guarded by the install's session, through a new adapter, `@robkit/next`. Follow the checklist ticket 01 added to create-robkit's README.

- **Adapter.** The guard needs Node (`@robkit/session` loads `node:http`), so it can't run on the Edge runtime. Use a Node-runtime `proxy.ts` (or middleware). It runs the request guard and passes the viewer on to the app in a request header, after deleting any copy of that header the request came with. It exports a `viewer()` helper for server components, route handlers and server actions that reads that header. The helper is typed, and it throws a clear fault if the proxy didn't run. The adapter has the same published-package shape as `@robkit/hono`, conformance cases included.
- **A lapsed session.** Server actions are POSTs, and client navigations fetch RSC payloads with `sec-fetch-mode: cors`, so both get the guard's 401, not a 302. Find out what Next's client does with that 401. Make each case end at the hub's sign-in, or at core's refresh, and come back to the page, as `sessionFetch` does for Start. The whole-stack test proves it for a client navigation and for a server action.
- **Template.** `templates/stacks/next`: a page that says who is asking, records a visit through a server action or in the server component, and uses the UI kit. Plus `AGENTS.md`, `CLAUDE.md` and the scripts every stack has. Dev works behind the dev proxy on `<slug>.robkit.localhost` (`allowedDevOrigins`). The build lands in `dist` (`distDir`) so turbo's outputs and the Dockerfile find it. Telemetry is off. `dependencies` are exactly what the server needs at runtime, so the image's extraneous-packages check passes.
- **Choices, whole-stack test, production, docs:** as in ticket 01.

**Blocked by:** 01

**Status:** done

- [x] `@robkit/next` passes the guard's conformance cases and has the published-package shape
- [x] init `--stack next` and `robkit add --stack next` make a working app, and both wizards offer it
- [x] A lapsed session on a client navigation and on a server action goes to sign-in and returns, proven in the whole-stack test
- [x] The generated app passes the install's lint, typecheck, test, format check and `robkit check`
- [x] The whole-stack journeys pass for a Next install in the pull-request gate
- [x] The production test serves a Next app over https
- [x] The PR's CI `gate` job passes on GitHub

## Comments

### What I chose, and why

Chosen in the build, awaiting R's review.

- **Next 16.4.5, App Router, `src/proxy.ts`.** Next 16's proxy runs on Node, which the guard needs (`node:http`, `node:crypto`). The matcher is every path but `/_next/`. Next reads it statically, so it stays a literal in the template, not in the adapter.
- **The adapter's API.** `guarded(options)` returns the proxy, `(request: Request) => Promise<Response>`. It is typed as Next's `NextProxy` in the types test. It runs `requestGuard` on the URL the browser asked for: the path, the `Host` header, and the protocol from `x-forwarded-proto`. Then it sends the guard's answer, or lets the request through with `NextResponse.next({ request: { headers } })`. `viewer()` is `() => Promise<Viewer>`. Server components, route handlers and server actions call it. A request with no Host gets a 400, as with Express.
- **The viewer header can't be forged.** The proxy sets `robkit-viewer`, replacing any copy the request came with. Its value is `<key>.<base64url JSON>`. The key is 32 random bytes made once per server process and kept on `globalThis`, because the proxy and the app are bundled apart but run in one process. `viewer()` checks the key with `timingSafeEqual`, so a header sent to a path the matcher skips fails. It throws a fault that names `src/proxy.ts` and the matcher.
- **A lapsed session on a client navigation.** The RSC fetch gets the guard's 401. Next's client treats any answer that isn't RSC as a cue to load the page in full, and the guard redirects that load as usual. The adapter adds nothing.
- **A lapsed session on a server action.** The adapter adds `x-action-redirect: <401's location with next=page>;push` to the guard's 401 when the request has `next-action`. Next's client turns that into a full load: core's refresh through the app's `/_robkit/refresh`, or the hub's sign-in. The 401 body and status are the guard's, unchanged. Without the header, Next throws "An unexpected response was received from the server" and the page stays put. That is the red run below.
- **Serving.** `node --run start` migrates, then runs `src/serve.ts`, which is `next({ dev: false })` on `node:http` at `HOST`/`PORT`. That is the same shape as the other stacks, and it needs no `next start` flags. The build goes to `dist` (`distDir`).
- **Dependencies.** `dependencies` are `@robkit/input`, `drizzle-orm`, `next`, `postgres`, `react` and `react-dom`. `@robkit/next` is a dev dependency: `next build` bundles it into `dist`, and the production test's image check passes.
- **Babel out of the image.** styled-jsx (Next's dependency) takes `@babel/core` as an optional peer. pnpm links it because the hub and admin install Babel for Vite, and `pnpm install --prod` keeps it, which put 36 Babel packages in the Next image. The base `pnpm-workspace.yaml` now overrides `styled-jsx>@babel/core` to `-`. This is the one stack-specific line in a shared template file, and it lives there because pnpm settings are install-wide.
- **Telemetry.** `next.config.ts` sets `NEXT_TELEMETRY_DISABLED` for `next build` and the server, which load the config before their telemetry. `next dev`'s own process never loads the config. It reported the session's end and printed Next's notice, so the `dev` script also sets the variable. The script is POSIX-only, like `pnpm dev`.
- **Dev.** `allowedDevOrigins` is the install's domain and `*.domain`. A linked install sets `experimental.turbopackAdditionalRoots` to the checkout, so Turbopack can read the linked `@robkit/*` packages. `agentRules: false` stops `next dev` from writing into the app's `AGENTS.md`. `next-env.d.ts`, which Next writes, is in the base `.prettierignore` and the base ESLint ignores, and the app's tsconfig excludes it, since it points at `dist/types` before a build has made them.
- **Journeys.** `describeJourneys` takes `lapsedCalls`, which runs `lapsed-call-journeys.ts`: a client navigation with an expired token, and a server action after the owner signs out. Next's test file passes `{ lapsedCalls: true }`.

### Proof

- Red first:
  - The adapter's tests failed before `guarded.ts` existed.
  - The create-robkit stack-list tests failed on the old `choices.ts` (15 failed).
  - The https server-action test failed before the forwarded protocol was read.
  - With `x-action-redirect` taken out, the whole-stack server-action journey failed: the browser stayed on the page and Next logged "An unexpected response was received from the server".
  - Before their fixes, the production test found the Babel packages and the install's own CI failed `pnpm lint` on `next-env.d.ts`.
- `@robkit/next`: 45 tests and a types test. They cover the conformance cases, both lapse cases, https, the callback round trip, a replaced forged header, `viewer()` with no header and with a wrong key, and the 400. Coverage is 100%.
- A linked install with `--stack next` on Windows passed `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm build`.
- WSL, `pnpm --filter @internal/e2e test`: 7 files, 61 passed, 9 skipped. The Next install ran every journey, both lapse journeys and its own CI. The Express install's added app is Next.js, and the Next install adds Start.
- WSL, `pnpm --filter @internal/e2e test:production`: 12 passed, including the added Next app over https and its image's extra-packages check.
- WSL, by hand: Next's HMR websocket (`/_next/hmr`) connected through the dev proxy, and an edit to `page.tsx` reached the open page with no reload. `next dev` exited without the telemetry notice.
- `pnpm check` on Windows: everything passes except 3 `vendor.test.ts` cases that fail on this machine on the base commit too (the global pnpm in the temp folder exits 1, not 3).

### Not verified

- Native Windows `pnpm dev`. The `dev` script's variable prefix needs a POSIX shell, as `pnpm dev` already does.
- Next 16.0 to 16.3, the floor of the peer range. Only 16.4.5 ran.
- One full-suite WSL run, with four installs at once, timed out six journeys across every stack, including the server action's sign-in wait. Rerun, all passed.

### For other tickets

- **Ticket 03 (Go)** touches the same shared files I did:
  - the stack lists in create-robkit's tests (`choices`, `usage`, `wizard`, `add-wizard`, `create-robkit-command`, `generate`) and `choices.ts`;
  - `api-report.md`;
  - the docs (root README, `docs/architecture.md`, `docs/testing.md`, the guard, session and create-robkit READMEs);
  - `AGENTS.md`'s adapters list;
  - `tooling/eslint/package-graph.js` and `layers.test.js`;
  - `tooling/e2e/src/install-journeys.ts` (one option);
  - the base template's `.prettierignore`, `eslint.config.js` and `pnpm-workspace.yaml`.
- The added-app cycle is now start → react-hono → express → next → start.
- The base `pnpm-workspace.yaml` now has an `overrides` key, and the generator adds the link overrides to it. A test that appends its own `overrides:` makes a duplicate key, so set it with `parseDocument` (see `vendor.test.ts`).
- The whole-stack suite now runs four installs at once, and Next's dev compile is heavy. If CI's gate times out, look at load before code.
