---
"@robkit/serve": patch
---

When `onStopped` rejects, the server prints `<name> stopped, but its clean-up failed.` with the error and exits 1. It printed `<name> couldn't listen on <host>:<port>.`, though it had listened.
