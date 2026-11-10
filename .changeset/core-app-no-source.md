---
"create-robkit": minor
---

A new install's `apps/core` is a `package.json` alone: its `dev`, `migrate` and `start` scripts run `robkit-core`, and it depends on `@robkit/core` only. Its `src`, `tsconfig.json` and `typecheck` script are gone, so a fix to how core starts reaches an install with an update to `@robkit/core`.
