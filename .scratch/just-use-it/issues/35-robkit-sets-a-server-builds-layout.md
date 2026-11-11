# 35: `robkit()` sets a server build's layout

**What to build:** The React + Hono and React + Express templates' `vite.config.ts` hold `build: { ssr: "src/serve.ts", outDir: "dist", ssrEmitAssets: true }`. The `start` script's `dist/serve.js` and `serve()`'s default `dist/assets` both depend on those three values. An owner who edits `build` breaks production, and nothing says why: without `ssrEmitAssets` the page's stylesheet is missing from the image. The PRD's picture of an app's files shows no `build` block. Milestone 2's code round raised this, and milestone 4's ticket round decided it.

- **An option, not a default.** `robkit({ serve: "src/serve.ts" })` from `@robkit/vite` sets the three values for a build. `robkit()` with no `serve` changes nothing for a build, as today: the hub, the React + Go stack and TanStack Start use the same plugin and build another way.
- **The two templates use it.** Their `vite.config.ts` lose the `build` block and pass `serve`.
- **A config that disagrees fails the build.** When the app's own config sets `build.ssr` or `build.outDir` to something else, the build stops with a message that names the setting and says what to do. It doesn't quietly win or lose.
- **Dev and tests are untouched.** The option does nothing under `pnpm dev` or Vitest.
- **Docs.** `packages/vite/README.md`, the two stacks' `AGENTS.md` and the map say where the build's layout comes from. Ticket 10's line that left `build` with the app is noted as reversed, in this ticket's comments.
- **Installs that exist.** An app is the owner's copy, and its `build` block keeps working. The changeset says the option exists and that nothing has to change.

**Blocked by:** 10, 11

**Status:** ready-for-agent

- [ ] A React + Hono app and a React + Express app with no `build` block build to `dist/serve.js` and `dist/assets`, and the production test serves each page with its stylesheet
- [ ] `robkit()` with no `serve` leaves a build's config as it was, shown for the hub, a React + Go app and a Start app
- [ ] An app whose config sets another `build.outDir` or `build.ssr` beside `serve` fails its build with a message naming the setting
- [ ] The option changes nothing under `pnpm dev` or Vitest
- [ ] `@robkit/vite`'s API report has the option, and a changeset names `@robkit/vite` and `create-robkit`
- [ ] `packages/vite/README.md` and the two stacks' `AGENTS.md` say where the build's layout comes from
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From the ticket round, 2026-11-11

Both reviewers answered the question ticket 27 carried from milestone 2's code round the same way: yes, as `robkit({ serve: "src/serve.ts" })`, for the two stacks that build a server with Vite, and never as what `robkit()` does by default. `packages/vite/src/robkit.ts` says today that it changes nothing for a build, and three other kinds of app rely on that.

- Opus: fail the build when the app's config sets another `outDir` or `ssr`.
- Sol: test every way the plugin is used today, and say how an app's own setting is handled.

The docs site, built beside this milestone on the `docs-site` branch, has a guide for each of these two stacks that shows the template's `vite.config.ts`. Say in these comments what a reader of those guides sees differently afterwards. The docs site's last build ticket (26) works from that.

Order: [ticket 27](27-templates-finished.md) edits the same two stacks' `AGENTS.md`. Whichever merges second merges the milestone's branch in first.
