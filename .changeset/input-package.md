---
"@robkit/input": patch
"@robkit/session": patch
"@robkit/core": patch
"@robkit/dev": patch
"create-robkit": patch
---

The readers move out of `@robkit/session` into a package of their own, `@robkit/input`, which imports nothing.

- `@robkit/session/input`, `@robkit/session/app-env` and `@robkit/session/manifest` are gone. Import their exports from `@robkit/input`.
- `readSlug`, `Slug`, `slugProblem`, `platformApps`, `isPlatformApp` and `PlatformApp` move from `@robkit/session/addresses` to `@robkit/input`.
- An install's core, its stack apps' templates and the hub and admin take `@robkit/input`. The core and stack templates no longer take `@robkit/session` directly.
