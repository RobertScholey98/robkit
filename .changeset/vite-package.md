---
"@robkit/vite": minor
---

New package. `robkit()` is a Vite plugin that sets an app's dev server up behind `pnpm dev`'s proxy: 127.0.0.1 at `PORT` with `strictPort`, the install's host names, and a check of the guard's settings as the server starts. `robkit({ guarded: false })`, for the hub, skips the check and sends the hub's headers. Under Vitest, and for a build, it changes nothing.
