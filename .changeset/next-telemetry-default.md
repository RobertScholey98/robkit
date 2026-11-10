---
"@robkit/next": patch
---

`withRobkit()` sets `NEXT_TELEMETRY_DISABLED=1` only where nothing has set it, so a value from the shell or the app's `.env` stays.
