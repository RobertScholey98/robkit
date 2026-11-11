---
"@robkit/vite": patch
"create-robkit": patch
---

`robkit({ serve: "src/serve.ts" })` sets the build's layout for an app whose server Vite builds: the server goes to `dist/serve.js`, and the stylesheet its page links to `dist/assets`, where the `start` script and `serve()` look. A config that sets `build.ssr` or `build.outDir` to another value beside it, or `build.ssrEmitAssets` to `false`, stops the build with a message that names the setting. It does nothing under `pnpm dev` or Vitest, and `robkit()` with no `serve` changes nothing for a build.

New React + Hono and Express apps use it, and their `vite.config.ts` has no `build` block. Nothing has to change in an app you already have: its `build` block keeps working. To move to the option, pass `serve: "src/serve.ts"` to `robkit()` and delete the `build` block.
