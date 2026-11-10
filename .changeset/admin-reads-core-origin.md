---
"create-robkit": patch
---

Admin's server passes its guard only its access rule, and reads core's origin with `coreOrigin()` from `@robkit/hono`. It imports only `isRecord` from `@robkit/input`, to read Vite's manifest.
