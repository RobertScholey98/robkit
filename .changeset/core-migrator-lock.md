---
"@robkit/core": patch
---

`migrate` locks core's journal table while it migrates, so two cores that start together apply each migration once. A run that loses the race to create the table finds it there and carries on. It takes no advisory lock.
