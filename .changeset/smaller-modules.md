---
"@robkit/core": patch
"create-robkit": patch
---

Core's routes live in one Hono app per group, mounted by `createApp`, and `/apps/:slug/access` reads only the app it's asked about. create-robkit's Coolify deploy is split into its config, API client and deploy modules, and the generator mounts the example app without the template-merging code it no longer needed. Nothing a caller sees changes.
