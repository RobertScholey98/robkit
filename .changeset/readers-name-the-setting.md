---
"@robkit/input": patch
---

`readCoreUrl` and `readAppSlug` take an optional name for the setting they read, and their problems say it. It is `ROBKIT_CORE_URL` and `ROBKIT_APP` by default. The guard uses it to read its `core` and `app` options with the same readers.
