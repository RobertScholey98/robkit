---
"create-robkit": patch
---

An install's `callCore` reads core's answer under the same 10-second deadline as the request, so an answer whose body stalls gives up with the timeout message. A body that breaks off reads as core being unreachable. An optional `report(message, cause)` is told what went wrong underneath a failed call.
