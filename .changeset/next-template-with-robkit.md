---
"create-robkit": minor
---

A Next.js app's `next.config.ts` is one call, `withRobkit()` from `@robkit/next/config`, with room for the app's own settings as its argument. `@robkit/next` moves to the app's `dependencies`, since Next loads the config in production too.
