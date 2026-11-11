---
"@robkit/core": patch
---

Two cores that start together with different `ROBKIT_APPS`, as when a deploy replaces core's container, apply their lists one after the other, so the catalog holds the whole list of the one that started last, never a mix of the two.
