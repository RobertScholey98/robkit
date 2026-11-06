---
"create-robkit": patch
---

An install's servers and scripts read their environment with `orExit`. A variable that won't do now prints the line that says how to fix it and exits 1, where admin's server, the example's server and its database threw it with a stack.
