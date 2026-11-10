---
"@robkit/next": minor
"create-robkit": patch
---

`@robkit/next/serve` exports `serve(options?)`, which serves a built Next.js app in production: Next's request handler, ready and in production mode, on `HOST` and `PORT`, until SIGTERM. It resolves with the Node server. The Next template's `serve.ts` calls it, and the template no longer lists `@robkit/input`.
