---
"@robkit/core": patch
---

`/refresh` mints a token only when `next` is on the exact origin of admin or an app in core's catalog: protocol, host and port. A slug core doesn't know, or a known app on another port or protocol, gets the 400 it got before.
