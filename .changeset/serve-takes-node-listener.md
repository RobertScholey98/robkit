---
"@robkit/serve": minor
"@robkit/core": patch
---

`listenUntilStopped(app, options)` takes a Node request listener, so a server needs no Hono to use it. Core hands it `getRequestListener(app.fetch)`. An answer sent while the server stops still closes its connection, and so does the next answer on a connection whose answer had begun before the signal.
