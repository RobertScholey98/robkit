---
"create-robkit": patch
---

`robkit check`'s rule that app code never reads the session cookie scans `.go` files too, reading their strings, comments and runes as Go does.
