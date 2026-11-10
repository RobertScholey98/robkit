---
"@robkit/core": patch
---

`ensureSigningKey` locks `core.signing_keys` while it looks for the key, in place of an advisory lock. Any role in the shared database could hold the advisory key and keep core from starting.
