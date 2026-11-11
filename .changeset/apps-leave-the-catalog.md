---
"@robkit/core": patch
---

Core's catalog now follows `ROBKIT_APPS`. When core starts, it deletes each app the list no longer names, with the rule the owner set for it, so a removed app leaves the launcher and admin, and core mints no token for it. `ROBKIT_APPS=[]` removes every app. An app whose slug comes back is a new app, with the rule its manifest declares, or owner only. Core deletes nothing from the app's schema or role in Postgres. `registerApps` now takes the whole list, and deletes every app it leaves out.
