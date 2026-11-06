---
"@robkit/core": patch
---

Listing roles groups the role memberships by role once, rather than scanning every membership for each role. Session expiry and token renewal live in `session-claims.ts`, apart from the database, and `generateAccessCode` takes its random pick as an argument. Core behaves as before.
