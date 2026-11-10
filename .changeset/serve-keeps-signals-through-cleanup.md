---
"@robkit/serve": patch
---

A second SIGTERM or SIGINT that arrives while `onStopped` runs no longer ends the process. The server keeps its signal listeners until `onStopped` has finished, then prints `<name> stopped` and exits 0.
