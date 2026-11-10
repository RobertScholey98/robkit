---
"@robkit/next": minor
---

New `@robkit/next/config` entry. `withRobkit(config?)` is a whole `next.config.ts`: the build in `dist`, the dev proxy's hosts allowed, `agentRules` off, a linked install's checkout as a Turbopack root, telemetry off for `next build`, and a check of the guard's settings as `next dev` starts. The app's own settings go in its argument.
