---
"@robkit/session": minor
---

The guard refuses a write from another origin with a plain-text 403, before it reads the session. A browser sends an app's cookie with a form posted from a sibling subdomain, so without this a page on `evil.<domain>` could post to an app as the viewer.

GET, HEAD and OPTIONS pass as before. Any other method passes when `Sec-Fetch-Site` is `same-origin` or `none`. A browser that sends no `Sec-Fetch-Site` is judged by `Origin`, and a request with neither, as a script sends, passes. A WebSocket handshake is judged by `Origin` alone. The rule covers the guard's own paths under `/_robkit/` too.
