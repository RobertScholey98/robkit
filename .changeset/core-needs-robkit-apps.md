---
"@robkit/core": patch
---

Core refuses to start when `ROBKIT_APPS` is missing or blank, where it read either as no apps. `pnpm dev` and `robkit deploy` always set it. If you start core some other way, set it to `[]` for an install with no apps of its own. Core prints:

```text
ROBKIT_APPS is not set. pnpm dev and robkit deploy set it from each app's manifest. Set it to [] only for an install with no apps of its own, since [] takes every app out of core's catalog, with the rule the owner set for each.
```
