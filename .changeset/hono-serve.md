---
"@robkit/hono": minor
"create-robkit": patch
---

`@robkit/hono/serve` exports `serve(app, options?)`, which serves a Hono app in production: the client's files under `/assets`, the app's `public` folder at the root, then the app, on `HOST` and `PORT`, until SIGTERM. It returns the Node server. The React with Hono template's `serve.ts` and admin's call it, and neither lists `@hono/node-server` any more. The React with Hono template no longer lists `@robkit/input`.
