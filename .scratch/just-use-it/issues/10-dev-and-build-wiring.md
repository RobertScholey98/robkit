# 10: Dev and build wiring in packages

**What to build:** Each stack's Vite or Next config holds what robkit needs to run the app behind its dev proxy: the port and host, the allowed host names, a check that core's address is set, and for some stacks much more. Express's `vite.config.ts` is 63 lines, 40 of them a plugin that hands requests to Express. Next's `next.config.ts` is 55 lines about telemetry, the build folder and linked checkouts. The hub's and admin's configs repeat the same lines. An owner shouldn't have to read or keep any of it.

- **`@robkit/vite`.** A new published package with one export, `robkit()`, a Vite plugin. It does what the configs do by hand today: listen on `127.0.0.1` and on `PORT` with `strictPort`, allow the install's host names, and check the guard's settings when the dev server starts, so a missing one fails then and not on the first request. It skips that check under Vitest, which loads the config with no `pnpm dev` behind it, and for an app with no guard, the hub, which passes an option. `vite` is a peer dependency. It has the published-package shape.
- **The hub's headers in dev.** The hub isn't guarded, so ticket 06's headers don't reach it. `robkit()` sends `frame-ancestors 'none'` and `nosniff` from the hub's dev server. Ticket 11 does the same for its production server.
- **Express's dev handoff.** `@robkit/express/vite` exports the plugin that serves an Express app from Vite's dev server, with the entry as its argument. It replaces the plugin written out in the template.
- **Next.** `@robkit/next/config` exports `withRobkit(config?)`. It returns the function Next calls with the phase, and gives the config an app needs in an install: the build in `dist`, the dev proxy's origins allowed, `agentRules` off, and the extra Turbopack root a linked install needs. In the dev phase it keeps today's check of the guard's settings, because Next loads `proxy.ts` only on the first request. The app's `next.config.ts` becomes one call, with room for the owner's own settings as its argument.
- **Next loads its config in production.** So `@robkit/next` moves from the Next template's `devDependencies` to its `dependencies`, and `@robkit/next/config` imports nothing from the guard or from anything a build-only package brings. The production test's extra-packages check must pass with that declared.
- **Telemetry.** `next dev` reads its telemetry setting before it loads any config. `robkit-dev` sets `NEXT_TELEMETRY_DISABLED=1` in every app's environment, so the Next template's `dev` script loses its `VAR=value` prefix, which doesn't run on Windows. For the build and the production server, confirm where Next reads the setting and set it where that works; say what you found.
- **Templates.** react-hono, express, start, go, the hub and admin use `robkit()`. Each config keeps what is the app's own: its plugins and its `build` settings. No config imports `@robkit/input`.
- **Docs.** Each stack's `AGENTS.md`, the new README, and create-robkit's "Add a stack" checklist.

**Blocked by:** 09

**Status:** ready-for-agent

- [ ] `robkit()` gives a dev server on `127.0.0.1:$PORT` that answers the install's host names, and fails at start, naming the variable, when a guard setting is missing
- [ ] An Express app runs under Vite's dev server through `@robkit/express/vite`, and an edit to its server reloads without a restart
- [ ] `withRobkit()` gives a Next app that runs under `pnpm dev`, builds, and serves in the production image, linked and from packed packages
- [ ] The Next app's production image holds `@robkit/next` and nothing only its build uses
- [ ] A Next app under `pnpm dev` with a guard setting missing fails as it starts, naming the variable
- [ ] Each stack's tests from ticket 08 still run with no guard settings in the environment
- [ ] The hub under `pnpm dev` sends `frame-ancestors 'none'` and `nosniff`
- [ ] No template's Vite or Next config imports `@robkit/input`, the hub's and admin's included
- [ ] The whole-stack and production tests pass for every stack
- [ ] The new package and the two new entries have README sections, API reports, graph entries and changesets
- [ ] The PR's CI `gate` job passes on GitHub
