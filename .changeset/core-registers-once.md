---
"@robkit/core": patch
---

`registerApps` works when two cores start together. The core whose insert adds an app adds the roles its rule names; the other leaves that app alone instead of failing on a duplicate key.
