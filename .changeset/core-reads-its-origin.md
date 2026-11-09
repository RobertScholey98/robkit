---
"@robkit/core": minor
"create-robkit": patch
---

Core reads its address from `ROBKIT_CORE_URL` alone and works out the install's domain, protocol and port from it. It no longer reads `ROBKIT_DOMAIN`, and refuses to start without `ROBKIT_CORE_URL`. `createApp` takes `origin`, a `CoreOrigin`, where it took `domain`, and `CoreConfig` holds `origin` in place of `domain`. `pnpm dev` and `robkit deploy` already set `ROBKIT_CORE_URL` on core.
