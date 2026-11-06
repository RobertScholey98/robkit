---
"@robkit/core": patch
---

Core reads an app's slug at its route with `readSlug`, and answers 404 for a name that can't be one without asking the database. `accessOf` and `setAccess` take a `Slug`.
