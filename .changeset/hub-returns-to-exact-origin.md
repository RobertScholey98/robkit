---
"create-robkit": patch
---

The hub sends the browser back after sign-in only to `next` on an app's own origin, with the hub's protocol and port. A `next` over http on an https install, on another port, or two labels deep keeps the browser on the hub.
