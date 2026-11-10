---
"create-robkit": patch
---

`robkit vendor` copies robkit's Go module before it changes the install's settings, so a run that can't find the module leaves the install as it was and can run again.
