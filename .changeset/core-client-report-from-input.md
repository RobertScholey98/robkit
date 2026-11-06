---
"create-robkit": patch
---

An install's core-client and hub take `Report` and `reportToConsole` from `@robkit/input/report`, in place of core-client's own copy. core-client no longer exports them.
