---
"@robkit/hono": minor
---

`@robkit/hono/testing`, for tests only, gives the guard's viewer builders and `guardedAs(viewer)`, a stand-in for `guarded()` that serves every request as that viewer. It serves only in a test run, when `NODE_ENV` is `test` or Vitest is running, and refuses every request anywhere else.
