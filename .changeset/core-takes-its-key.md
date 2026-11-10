---
"@robkit/core": minor
---

`createApp` takes an optional `signingKey`, loaded with `ensureSigningKey` before core listens. The first sign-ins after a start then don't load the key inside their transaction.
