---
"@robkit/session": minor
---

`coreOrigin()` gives core's public origin from `ROBKIT_CORE_URL`, for an app whose page calls core, such as admin. It reads the variable as the guard does, and exits the same way when it is unset or won't do.
