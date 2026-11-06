---
"@robkit/core": patch
---

`Database` is a type alias for core's Drizzle connection rather than an empty interface that extends it. Nothing that uses it changes.
