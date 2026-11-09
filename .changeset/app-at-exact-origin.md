---
"@robkit/input": minor
---

`Install.appAt(url)` names the app `url` is on only when `url`'s origin is exactly that app's origin, protocol and port included. `appOf` and `onInstall` keep ignoring the protocol and port, so use `appAt` where a URL decides who gets a token or a cookie.
