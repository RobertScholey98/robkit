# 35: `robkit()` sets a server build's layout

**What to build:** The React + Hono and React + Express templates' `vite.config.ts` hold `build: { ssr: "src/serve.ts", outDir: "dist", ssrEmitAssets: true }`. The `start` script's `dist/serve.js` and `serve()`'s default `dist/assets` both depend on those three values. An owner who edits `build` breaks production, and nothing says why: without `ssrEmitAssets` the page's stylesheet is missing from the image. The PRD's picture of an app's files shows no `build` block. Milestone 2's code round raised this, and milestone 4's ticket round decided it.

- **An option, not a default.** `robkit({ serve: "src/serve.ts" })` from `@robkit/vite` sets the three values for a build. `robkit()` with no `serve` changes nothing for a build, as today: the hub, the React + Go stack and TanStack Start use the same plugin and build another way.
- **The two templates use it.** Their `vite.config.ts` lose the `build` block and pass `serve`.
- **A config that disagrees fails the build.** When the app's own config sets `build.ssr` or `build.outDir` to something else, the build stops with a message that names the setting and says what to do. It doesn't quietly win or lose.
- **Dev and tests are untouched.** The option does nothing under `pnpm dev` or Vitest.
- **Docs.** `packages/vite/README.md`, the two stacks' `AGENTS.md` and the map say where the build's layout comes from. Ticket 10's line that left `build` with the app is noted as reversed, in this ticket's comments.
- **Installs that exist.** An app is the owner's copy, and its `build` block keeps working. The changeset says the option exists and that nothing has to change.

**Blocked by:** 10, 11

**Status:** done

- [x] A React + Hono app and a React + Express app with no `build` block build to `dist/serve.js` and `dist/assets`, and the production test serves each page with its stylesheet
- [x] `robkit()` with no `serve` leaves a build's config as it was, shown for the hub, a React + Go app and a Start app
- [x] An app whose config sets another `build.outDir` or `build.ssr` beside `serve` fails its build with a message naming the setting
- [x] The option changes nothing under `pnpm dev` or Vitest
- [x] `@robkit/vite`'s API report has the option, and a changeset names `@robkit/vite` and `create-robkit`
- [x] `packages/vite/README.md` and the two stacks' `AGENTS.md` say where the build's layout comes from
- [ ] The PR's CI `gate` job passes on GitHub

## Comments

### From the ticket round, 2026-11-11

Both reviewers answered the question ticket 27 carried from milestone 2's code round the same way: yes, as `robkit({ serve: "src/serve.ts" })`, for the two stacks that build a server with Vite, and never as what `robkit()` does by default. `packages/vite/src/robkit.ts` says today that it changes nothing for a build, and three other kinds of app rely on that.

- Opus: fail the build when the app's config sets another `outDir` or `ssr`.
- Sol: test every way the plugin is used today, and say how an app's own setting is handled.

The docs site, built beside this milestone on the `docs-site` branch, has a guide for each of these two stacks that shows the template's `vite.config.ts`. Say in these comments what a reader of those guides sees differently afterwards. The docs site's last build ticket (26) works from that.

Order: [ticket 27](27-templates-finished.md) edits the same two stacks' `AGENTS.md`. Whichever merges second merges the milestone's branch in first.

### Chosen in the build, 2026-11-11

- **`serve` acts only on Vite's `build` command.** Vite 8.3.5 passes the `config` hook `command: "serve"` under `pnpm dev`, and Vitest runs the serve command too, so neither sees the option. It doesn't look at `VITEST`: a `vite build` a test starts inherits `VITEST` (ticket 17 hit the same leak for `pnpm dev`), and still needs the layout its start script expects. A test shows both.
- **A disagreement is checked before the layout is merged.** Vite merges a plugin's returned config over the app's (`runConfigHook` calls `mergeConfig(config, result)`), so the plugin's value would win quietly. The hook reads the app's own `build` first. `build.ssr` or `build.outDir` set to another value stops the build. The same value, or the same path written another way (`./src/serve.ts`, an absolute `dist`), passes, so an existing app that adds `serve` and keeps its `build` block builds as before.
- **`build.ssrEmitAssets: false` beside `serve` stops the build too**, as a disagreement like the other two, since the image would have no stylesheet for the page. `true` passes.
- **One message names every setting that disagrees**, one line each, with what to do: "Remove build.outDir from vite.config.ts." Its first line is "vite.config.ts sets the server build's layout beside robkit({ serve }), which sets it itself."
- **The production test needed no change.** `tooling/e2e/src/production.test.ts` already expects `stylesheets: [200]` from the example's page and from each `robkit add`ed app's, one per ready stack, which includes React + Hono and Express. CI's `production` job on this PR is the proof of the first criterion; a unit test in `packages/vite` runs a real `vite build` and checks `dist/serve.js` and `dist/assets/*.css`.
- **The Start row uses Start's own Vite plugin.** `@robkit/vite` takes `@tanstack/react-start` (from the catalog) as a dev dependency, so the "no `serve`" test resolves a Start app's build with `tanstackStart()` in it, with and without `robkit()`. The hub and Go rows use their templates' settings. Each compares the resolved `build` and `environments`, without functions and plugin lists.
- **The changeset is a patch** for both packages: nothing breaks, and before 1.0.0 `minor` means a change that breaks an install.

### Ticket 10 reversed

Ticket 10 said each config "keeps what is the app's own: its plugins and its `build` settings", and chose that `robkit()` "changes nothing for `vite build`". For the React + Hono and Express stacks that is reversed: their build's layout now comes from `robkit({ serve })`, and their config has no `build` block. `robkit()` with no `serve` still changes nothing for a build, so ticket 10 stands for the hub, admin, Start and Go.

### For the docs site

An app's author sees a shorter `vite.config.ts` in a new React + Hono or Express app: no `build` block, and `robkit({ serve: "src/serve.ts" })` in place of `robkit()`. `pnpm build` still writes `dist/serve.js` and `dist/assets`. A `build.ssr` or `build.outDir` of another value, or `build.ssrEmitAssets: false`, now stops the build with a message naming the setting. An app made before this keeps its `build` block, and it builds as before; nothing has to change. The other stacks' configs are unchanged.

The React + Hono template's `vite.config.ts`, in full:

```ts
import devServer from "@hono/vite-dev-server";
import { robkit } from "@robkit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// robkit() sets the dev server up behind pnpm dev's proxy. Every request
// but Vite's own goes through the Hono app, so the guard sees page loads.
// For vite build, serve names the server's entry: robkit() builds it to
// dist/serve.js and the stylesheet its page links to dist/assets.
export default defineConfig({
  plugins: [
    robkit({ serve: "src/serve.ts" }),
    devServer({ entry: "src/server.tsx", injectClientScript: false }),
    tailwindcss(),
  ],
});
```

The Express template's `vite.config.ts`, in full:

```ts
import { robkit } from "@robkit/vite";
import { expressApp } from "@robkit/vite/express";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// robkit() sets the dev server up behind pnpm dev's proxy. expressApp()
// hands every request but Vite's own to the Express app, so the guard sees
// page loads, and loads it again after each change. For vite build, serve
// names the server's entry: robkit() builds it to dist/serve.js and the
// stylesheet its page links to dist/assets.
export default defineConfig({
  plugins: [
    robkit({ serve: "src/serve.ts" }),
    expressApp("/src/server.tsx"),
    tailwindcss(),
  ],
});
```
