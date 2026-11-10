---
"@robkit/dev": patch
---

`robkit-dev` refuses a `ROBKIT_DOMAIN` that isn't `localhost` or a name under it. `pnpm dev` serves plain http, and only a local install may.
