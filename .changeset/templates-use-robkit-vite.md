---
"create-robkit": minor
---

Every Vite app's `vite.config.ts` calls `robkit()` from `@robkit/vite`, which an app lists under `devDependencies`, and reads no setting itself. The hub calls `robkit({ guarded: false })`. Express's config takes `expressApp()` from `@robkit/vite/express` in place of the plugin it wrote out, and sets no `appType`. Admin has no `vitest.config.ts`.
