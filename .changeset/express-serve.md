---
"@robkit/express": minor
"create-robkit": patch
---

`@robkit/express/serve` exports `serve(app, options?)`, which serves an Express app in production: the client's files under `/assets`, the app's `public` folder at the root, then the app, on `HOST` and `PORT`, until SIGTERM. It returns the Node server. The Express template's `serve.ts` calls it, and the template no longer lists `@robkit/input`.
