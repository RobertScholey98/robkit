---
"create-robkit": patch
---

An install's lint refuses `throw new Error(x.error)` outside tests, as robkit's own does. A server ends on a problem with `orExit`.
