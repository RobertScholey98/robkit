---
"create-robkit": patch
---

A Next.js app's `dev` script sets `NEXT_TELEMETRY_DISABLED`, since `next dev`'s own process never loads `next.config.ts` and reported the session's end.
