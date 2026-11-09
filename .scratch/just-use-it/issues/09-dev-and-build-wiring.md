# 09: Dev and build wiring in packages

**What to build:** Each stack's Vite or Next config holds what robkit needs to run the app behind its dev proxy: the port and host, the allowed host names, a check that core's address is set, and for some stacks much more. Express's `vite.config.ts` is 63 lines, 40 of them a plugin that hands requests to Express. Next's `next.config.ts` is 55 lines about telemetry, the build folder and linked checkouts. An owner shouldn't have to read or keep any of it.

- **`@robkit/vite`.** A new published package with one export, `robkit()`, a Vite plugin. It does what the stacks' configs do by hand today: listen on `127.0.0.1` and on `PORT` with `strictPort`, allow the install's host names from `ROBKIT_DOMAIN`, and check the guard's settings when the dev server starts, so a missing one fails then and not on the first request. `vite` is a peer dependency. It has the published-package shape.
- **Express's dev handoff.** `@robkit/express/vite` exports the plugin that serves an Express app from Vite's dev server, with the entry as its argument. It replaces the plugin written out in the template.
- **Next.** `@robkit/next/config` exports `withRobkit(config?)`, which returns the Next config an app needs in an install: the build in `dist`, the dev proxy's origins allowed, telemetry off, `agentRules` off, and the extra Turbopack root a linked install needs. The app's `next.config.ts` becomes one call, with room for the owner's own settings as its argument. The `dev` script's `NEXT_TELEMETRY_DISABLED=1` goes if the config can cover it, since that form doesn't run on Windows.
- **Templates.** react-hono, express, start and go use `robkit()`. Each config keeps what is the app's own: its plugins and its `build` settings. The hub and admin use `robkit()` too if their configs repeat the same lines.
- **Nothing in a config imports `@robkit/input`.**
- **Docs.** Each stack's `AGENTS.md`, the new README, and create-robkit's "Add a stack" checklist.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] `robkit()` gives a dev server on `127.0.0.1:$PORT` that answers the install's host names, and fails at start, naming the variable, when a guard setting is missing
- [ ] An Express app runs under Vite's dev server through `@robkit/express/vite`, and an edit to its server reloads without a restart
- [ ] `withRobkit()` gives a Next app that runs under `pnpm dev`, builds, and serves, linked and from packed packages
- [ ] No stack's config file imports `@robkit/input`, and none is longer than 20 lines
- [ ] The whole-stack and production tests pass for every stack
- [ ] The new package and the two new entries have README sections, API reports, graph entries and changesets
- [ ] The PR's CI `gate` job passes on GitHub
