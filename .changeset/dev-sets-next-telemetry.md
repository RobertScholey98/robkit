---
"@robkit/dev": patch
"create-robkit": patch
---

`pnpm dev` sets `NEXT_TELEMETRY_DISABLED=1` for every app, so a Next.js app's `dev` script no longer sets it with a `VAR=value` prefix, which doesn't run on Windows.
