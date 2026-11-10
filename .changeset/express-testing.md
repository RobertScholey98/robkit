---
"@robkit/express": minor
---

`@robkit/express/testing`, for tests only, gives the guard's viewer builders and `guardedAs(viewer)`, a stand-in for `guarded()` that serves every request as that viewer. It refuses every request when `NODE_ENV` is `production`.
