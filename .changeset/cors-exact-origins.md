---
"@robkit/core": patch
---

Core's CORS allows exactly the hub's and admin's origins, protocol and port included. It no longer lets `http://hub.<domain>`, or the hub on another port, call a hosted core with the owner's cookie.
