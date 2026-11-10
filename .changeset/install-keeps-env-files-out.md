---
"create-robkit": patch
---

A new install's `.dockerignore` leaves out every `.env` and `.env.*` file in any folder, not only at the root, so an app's own `.env` stays out of its image. `.env.example` stays in.
