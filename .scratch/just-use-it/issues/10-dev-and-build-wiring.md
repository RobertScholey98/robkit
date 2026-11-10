# 10: Dev and build wiring in packages

**What to build:** Each stack's Vite or Next config holds what robkit needs to run the app behind its dev proxy: the port and host, the allowed host names, a check that core's address is set, and for some stacks much more. Express's `vite.config.ts` is 63 lines, 40 of them a plugin that hands requests to Express. Next's `next.config.ts` is 55 lines about telemetry, the build folder and linked checkouts. The hub's and admin's configs repeat the same lines. An owner shouldn't have to read or keep any of it.

- **`@robkit/vite`.** A new published package that holds everything robkit adds to Vite. Its main export is `robkit()`, a Vite plugin. It does what the configs do by hand today: listen on `127.0.0.1` and on `PORT` with `strictPort`, allow the install's host names, and check the guard's settings when the dev server starts, so a missing one fails then and not on the first request. An app with no guard, the hub, passes an option that skips the check. It has the published-package shape.
- **Vite stays out of production.** `vite` is a peer dependency of `@robkit/vite`, and an app lists `@robkit/vite` under `devDependencies`. No other published package names `vite` as a dependency or a peer, an optional one included. pnpm installs a missing peer by default, so a peer on a package an app runs in production would put Vite in that app's image, and the production test's extra-packages check counts a peer as needed (`tooling/e2e/src/extraneous-packages.js`), so it wouldn't say so. Add a check to the gate that holds this.
- **Under Vitest it changes nothing.** Vitest loads an app's `vite.config.ts` with no `pnpm dev` behind it. When `VITEST` is set, `robkit()` sets no server option, checks no setting and sends no header. So admin's `vitest.config.ts`, which exists only to dodge today's check, goes. If another plugin in admin's config won't load under Vitest, keep the file and name that plugin in its comment.
- **The hub's headers in dev.** The hub isn't guarded, so ticket 06's headers don't reach it. `robkit()` sends the three headers core sends (`X-Frame-Options: DENY`, `frame-ancestors 'none'` and `nosniff`) from the hub's dev server. Ticket 11 does the same for its production server.
- **Express's dev handoff.** `@robkit/vite/express` exports the plugin that serves an Express app from Vite's dev server, with the entry as its argument. It replaces the plugin written out in the template. It sets `appType: "custom"` itself, since without that Vite answers a page before Express sees the request, and the template's config drops the line. It imports nothing from Express: the app is a function it calls. It lives here and not in `@robkit/express` because of the rule above.
- **Next.** `@robkit/next/config` exports `withRobkit(config?)`. It returns the function Next calls with the phase, and gives the config an app needs in an install: the build in `dist`, the dev proxy's origins allowed, `agentRules` off, and the extra Turbopack root a linked install needs. In the dev phase it keeps today's check of the guard's settings, because Next loads `proxy.ts` only on the first request. The app's `next.config.ts` becomes one call, with room for the owner's own settings as its argument.
- **Next loads its config in production.** So `@robkit/next` moves from the Next template's `devDependencies` to its `dependencies`, and `@robkit/next/config` imports nothing from the guard or from anything a build-only package brings. The production test's extra-packages check must pass with that declared.
- **Telemetry.** `next dev` reads its telemetry setting before it loads any config. `robkit-dev` sets `NEXT_TELEMETRY_DISABLED=1` in every app's environment, so the Next template's `dev` script loses its `VAR=value` prefix, which doesn't run on Windows. For the build and the production server, confirm where Next reads the setting and set it where that works; say what you found.
- **Templates.** react-hono, express, start, go, the hub and admin use `robkit()`. Each config keeps what is the app's own: its plugins and its `build` settings. No config imports `@robkit/input`.
- **Docs.** Each stack's `AGENTS.md`, the new README, and create-robkit's "Add a stack" checklist.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] `robkit()` gives a dev server on `127.0.0.1:$PORT` that answers the install's host names, and fails at start, naming the variable, when a guard setting is missing
- [ ] An Express app runs under Vite's dev server through `@robkit/vite/express`, with no `appType` in its own config, and an edit to its server reloads without a restart
- [ ] A check in the gate fails when a published package other than `@robkit/vite` names `vite` as a dependency or a peer
- [ ] With `VITEST` set, `robkit()` changes nothing in the config it is given
- [ ] `withRobkit()` gives a Next app that runs under `pnpm dev`, builds, and serves in the production image, linked and from packed packages
- [ ] The Next app's production image holds `@robkit/next` and nothing only its build uses
- [ ] A Next app under `pnpm dev` with a guard setting missing fails as it starts, naming the variable
- [ ] Each stack's tests from ticket 08, and admin's, still run with no guard settings in the environment, and admin has no `vitest.config.ts` or one whose comment names the plugin that needs it
- [ ] The hub under `pnpm dev` sends `X-Frame-Options: DENY`, `frame-ancestors 'none'` and `nosniff`
- [ ] No template's Vite or Next config imports `@robkit/input`, the hub's and admin's included
- [ ] The whole-stack and production tests pass for every stack
- [ ] The new package, its `/express` entry and `@robkit/next/config` have README sections, API reports, graph entries and changesets
- [ ] The PR's CI `gate` job passes on GitHub
