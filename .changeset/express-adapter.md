---
"@robkit/express": patch
---

`@robkit/express` is the Express 5 adapter. `guarded(options)` is middleware that runs the request guard and hands handlers the viewer as `res.locals.viewer`, typed through `GuardedResponse`, or sends the guard's answer as it is.
