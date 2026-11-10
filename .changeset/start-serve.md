---
"@robkit/start": minor
"create-robkit": patch
---

`@robkit/start/serve` exports `serve(options?)`, which serves a built Start app in production: the files in `dist/client` at the root, then Start's server entry from `dist/server/server.js`, on `HOST` and `PORT`, until SIGTERM. It resolves with the Node server. The Start template's `serve.ts` calls it, and the template no longer lists `hono`, `@hono/node-server` or `@robkit/input`.
