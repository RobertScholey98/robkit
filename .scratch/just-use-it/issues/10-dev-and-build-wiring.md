# 10: Dev and build wiring in packages

**What to build:** Each stack's Vite or Next config holds what robkit needs to run the app behind its dev proxy: the port and host, the allowed host names, a check that core's address is set, and for some stacks much more. Express's `vite.config.ts` is 63 lines, 40 of them a plugin that hands requests to Express. Next's `next.config.ts` is 55 lines about telemetry, the build folder and linked checkouts. The hub's and admin's configs repeat the same lines. An owner shouldn't have to read or keep any of it.

- **`@robkit/vite`.** A new published package that holds everything robkit adds to Vite. Its main export is `robkit()`, a Vite plugin. It does what the configs do by hand today: listen on `127.0.0.1` and on `PORT` with `strictPort`, allow the install's host names, and check the guard's settings when the dev server starts, so a missing one fails then and not on the first request. It has one option, for the one app with no guard: the hub calls `robkit({ guarded: false })`, which skips the check and sends the hub's headers, below. Every other config, Go's included, calls plain `robkit()`, which sends no header: a guarded app's come from its guard. It has the published-package shape.
- **Vite stays out of production.** `vite` is a peer dependency of `@robkit/vite`, and an app lists `@robkit/vite` under `devDependencies`. No other published package names `vite` as a dependency or a peer, an optional one included. pnpm installs a missing peer by default, so a peer on a package an app runs in production would put Vite in that app's image, and the production test's extra-packages check counts a peer as needed (`tooling/e2e/src/extraneous-packages.js`), so it wouldn't say so. Add a check to the gate that holds this.
- **Under Vitest it changes nothing.** Vitest loads an app's `vite.config.ts` with no `pnpm dev` behind it. When `VITEST` is set, `robkit()` sets no server option, checks no setting and sends no header. So admin's `vitest.config.ts`, which exists only to dodge today's check, goes. If another plugin in admin's config won't load under Vitest, keep the file and name that plugin in its comment.
- **The hub's headers in dev.** The hub isn't guarded, so ticket 06's headers don't reach it. With `guarded: false`, `robkit()` sends the three headers core sends (`X-Frame-Options: DENY`, `frame-ancestors 'none'` and `nosniff`) from the hub's dev server. Ticket 11 does the same for its production server.
- **Express's dev handoff.** `@robkit/vite/express` exports the plugin that serves an Express app from Vite's dev server, with the entry as its argument. It replaces the plugin written out in the template. It sets `appType: "custom"` itself, since without that Vite answers a page before Express sees the request, and the template's config drops the line. It imports nothing from Express: the app is a function it calls. It lives here and not in `@robkit/express` because of the rule above.
- **Next.** `@robkit/next/config` exports `withRobkit(config?)`. It returns the function Next calls with the phase, and gives the config an app needs in an install: the build in `dist`, the dev proxy's origins allowed, `agentRules` off, and the extra Turbopack root a linked install needs. In the dev phase it keeps today's check of the guard's settings, because Next loads `proxy.ts` only on the first request. The app's `next.config.ts` becomes one call, with room for the owner's own settings as its argument.
- **Next loads its config in production.** So `@robkit/next` moves from the Next template's `devDependencies` to its `dependencies`, and `@robkit/next/config` imports nothing from the guard or from anything a build-only package brings. `@robkit/next`'s own dependencies, the guard's packages, arrive in the image with it, though Next has already bundled what it uses of them. That is accepted. The production test's extra-packages check must pass with that declared.
- **Telemetry.** `next dev` reads its telemetry setting before it loads any config. `robkit-dev` sets `NEXT_TELEMETRY_DISABLED=1` in every app's environment, so the Next template's `dev` script loses its `VAR=value` prefix, which doesn't run on Windows. For the build and the production server, confirm where Next reads the setting and set it where that works; say what you found.
- **Templates.** react-hono, express, start, go, the hub and admin use `robkit()`. Each config keeps what is the app's own: its plugins and its `build` settings. No config imports `@robkit/input`.
- **Docs.** Each stack's `AGENTS.md`, the new README, and create-robkit's "Add a stack" checklist.

**Blocked by:** 09

**Status:** done

- [x] `robkit()` gives a dev server on `127.0.0.1:$PORT` that answers the install's host names, and fails at start, naming the variable, when a guard setting is missing
- [x] An Express app runs under Vite's dev server through `@robkit/vite/express`, with no `appType` in its own config, and an edit to its server reloads without a restart
- [x] A check in the gate fails when a published package other than `@robkit/vite` names `vite` as a dependency or a peer
- [x] With `VITEST` set, `robkit()` changes nothing in the config it is given
- [x] `withRobkit()` gives a Next app that runs under `pnpm dev`, builds, and serves in the production image, linked and from packed packages
- [x] The Next app's production image holds `@robkit/next` and that package's own dependencies, and the production test's extra-packages check passes
- [x] A Next app under `pnpm dev` with a guard setting missing fails as it starts, naming the variable
- [x] Each stack's tests from ticket 08, and admin's, still run with no guard settings in the environment, and admin has no `vitest.config.ts` or one whose comment names the plugin that needs it
- [x] The hub under `pnpm dev` sends `X-Frame-Options: DENY`, `frame-ancestors 'none'` and `nosniff`, and plain `robkit()` adds no header
- [x] No template's Vite or Next config imports `@robkit/input`, the hub's and admin's included
- [x] The whole-stack and production tests pass for every stack
- [x] The new package, its `/express` entry and `@robkit/next/config` have README sections, API reports, graph entries and changesets
- [x] The headers robkit sends are written in `@robkit/input/headers` and nowhere else in TypeScript
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From milestone 1, added by the lead

Ticket 06 put the headers robkit sends in `@robkit/session`, in `packages/session/src/answer-headers.ts`: `securityHeaders(origin, framers)`, `withHeaders`, `isRedirect` and HSTS's value. `securityHeaders(origin, "none")` gives the hub's three headers.

`@robkit/session` depends on the guard, and ticket 11's `@robkit/serve` may depend on nothing from the guard. So this ticket moves that file to a new `@robkit/input/headers` entry, which every package may import, as `@robkit/input/report` and `@robkit/input/addresses` already are. `robkit()` takes the hub's headers from there. `@robkit/session` may keep exporting the functions for the adapters that use them.

### Chosen in the build

- **`robkit()` changes nothing for `vite build` either**, not only under Vitest. It reads its settings in Vite's `config` hook and only for `serve`, so a build never fails on a malformed `PORT`.
- **The check is `readGuardEnv`**, so every guarded app, admin and Go's page included, checks `ROBKIT_APP` and `ROBKIT_CORE_URL`. Admin and react-hono checked only `ROBKIT_CORE_URL` before. `pnpm dev` sets both for every app, and Go's server passes its environment on to its Vite.
- **The hub's headers in dev** are `securityHeaders("http://localhost", "none")`, set by a middleware before Vite's own. `pnpm dev` serves plain http, so there is no HSTS to send, and the hub may run with no `ROBKIT_CORE_URL` once its check is off.
- **Express's plugin is `expressApp(entry)`.** It accepts any function as the app and answers 500, naming the entry, for anything else. Its tests use a plain function, so `@robkit/vite` has no Express, even for tests.
- **`withRobkit(config?)` merges.** `distDir` and `agentRules` are robkit's. `allowedDevOrigins` and `experimental.turbopackAdditionalRoots` keep the app's entries beside robkit's. Every other setting is the app's as given. The whole-stack test's `headers()` for the Next example now goes in as the argument.
- **`withRobkit()` reads nothing outside `next dev`.** `PORT` and `ROBKIT_DOMAIN` are read for the dev phase only, so the production server can't fail on them. It imports `next/constants.js`, since Next has no exports map.
- **`strictTransportSecurity` is no longer exported.** It was a module export in `@robkit/session` but not in its index. As an entry of its own it would have become public, and nothing outside the file uses it.
- **Core takes the headers from `@robkit/input/headers`** directly. `@robkit/session` still re-exports them for the adapters.
- **The vite check is `tooling/repo-checks/src/vite-stays-out.test.ts`.** It reads each published manifest's `dependencies`, `peerDependencies` and `optionalDependencies`. An optional peer is also listed under `peerDependencies`, so that covers it.
- **The whole-stack test starts `pnpm dev` without the `VITEST*` variables.** The suite runs under Vitest, and `pnpm dev` handed `VITEST` to every app, so `robkit()` set no port and Vite took 5173. Before this ticket the configs set the port under `VITEST` too and skipped only the check, so the whole-stack test never ran the check. The lead then moved the answer into the product: `robkit-dev` keeps `VITEST` out of each app's environment (`packages/dev/src/runner.ts`), since an owner's own test that starts `pnpm dev` would hit the same thing. The whole-stack test hands its variables on again, and so proves it.
- **The headers check is `tooling/repo-checks/src/headers-in-one-place.test.ts`.** It fails on a header value as a string in a package's or template's TypeScript outside `packages/input/src/headers.ts`. Tests, test helpers and comments don't count, and Go's copy in `go/session` is outside it.
- **The install checks run each install's own CI with no `ROBKIT_*` variable**, and add one test: `next dev` in the Next install's example, with `ROBKIT_APP` unset, exits naming it. It runs there, not beside a running `pnpm dev`, since the check installs run one test at a time.

### Telemetry, as found in Next 16.4.5

- `next build` loads `next.config.ts` (`dist/build/index.js`, line 497) before it makes its `Telemetry` (line 540), whose constructor reads `NEXT_TELEMETRY_DISABLED`. So `withRobkit()` sets it, and that works for the build. I didn't set it in the Dockerfile: the image builds with `turbo run build`, and turbo 2's default strict env mode passes a task only the variables `turbo.json` names. I didn't try that route.
- The production server makes no `Telemetry`: `router-server.js` makes one only when `dev` is set, and `next()` from `serve.ts` makes none. Nothing to set there.
- `next dev`'s own process makes a `Telemetry` when the session ends (`dist/cli/next-dev.js`, line 149) and never loads the config. So `robkit-dev` sets `NEXT_TELEMETRY_DISABLED=1` in every app's environment (`packages/dev/src/runner.ts`), and the Next template's `dev` script is `next dev --hostname 127.0.0.1`.

### For ticket 11

- `securityHeaders(origin, "none")` from `@robkit/input/headers` gives the hub's three headers, and HSTS when `origin` is https. `withHeaders` and `isRedirect` are there too.
- The hub's `dependencies` still name `@robkit/input`, `hono` and `@hono/node-server`, for `serve.ts`. Each Node stack's still name `@robkit/input`, for `serve.ts` alone now: no config imports it.
- `@robkit/next` is in the Next template's `dependencies`. `@robkit/next/serve` can go beside it with no manifest change.
- Every Vite app lists `@robkit/vite` and `vite` under `devDependencies`, and no published package but `@robkit/vite` names `vite`, so ticket 11's by-name check should find no `vite` in the hub's or the Express app's image.
