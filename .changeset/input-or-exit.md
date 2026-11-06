---
"@robkit/input": patch
---

`orExit(read)` gives back a read's value, or prints its problem alone and ends the process with exit code 1. An app's server calls it as it starts, so a variable that won't do prints the line that says how to fix it, not a stack.
