---
"create-robkit": patch
---

The templates read a value they can't go on without through `orThrow`, rather than checking it and throwing by hand.
