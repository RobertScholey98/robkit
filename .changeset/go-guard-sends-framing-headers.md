---
"create-robkit": patch
---

The Go guard that `robkit vendor` copies into an install sends the same headers as `@robkit/session`: `X-Frame-Options: SAMEORIGIN` and `nosniff`, set before the handler runs, and HSTS on an https install. Its own redirects carry no framing header.
