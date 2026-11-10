---
"@robkit/serve": minor
---

`serve(app, options?)` reads `HOST` and `PORT`, refuses a malformed one with the reader's message, and answers folders of files before the app with their content type and a 304 for an unchanged one. Every answer carries `nosniff`. On SIGTERM it stops, then exits 0. It returns the Node server.
