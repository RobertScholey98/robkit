---
"@robkit/session": patch
---

`readSessionToken` and `readAppToken` refuse a token with no `exp`. Core always sets one, so only a forged or foreign token is affected.
