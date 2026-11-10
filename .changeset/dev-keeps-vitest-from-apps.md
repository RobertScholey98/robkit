---
"@robkit/dev": patch
---

`pnpm dev` keeps `VITEST` out of each app's environment. A test that starts `pnpm dev` hands the variable on, and `robkit()` in an app's Vite config sets nothing up under it, so the app listened on Vite's default port.
