---
"create-robkit": patch
---

`robkit deploy` no longer sets `ROBKIT_DOMAIN` on core, which reads only `ROBKIT_CORE_URL`. An existing core keeps the variable it was given until you delete it in Coolify, and it does no harm.
