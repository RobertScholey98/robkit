---
"create-robkit": patch
---

Next.js is a ready stack. `npm create robkit -- --stack next` makes the example on it, and `robkit add --stack next` adds an app on it; both wizards offer it. The template is an App Router app guarded by `@robkit/next` in `src/proxy.ts`: a page that says who is asking and records a visit, a server action that records another, and a page listing the latest. It builds to `dist`, serves with `src/serve.ts`, and keeps Next's telemetry off.
