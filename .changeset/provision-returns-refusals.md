---
"@robkit/provision": minor
"@robkit/dev": patch
"create-robkit": patch
---

The provision step returns what it refuses as a value instead of throwing: a name that isn't a slug, and a short database secret. `robkit database-urls` prints its own message for a short secret.
