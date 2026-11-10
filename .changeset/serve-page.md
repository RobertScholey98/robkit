---
"@robkit/serve": minor
---

`servePage(options?)` serves a built page with no app behind it, such as the hub: each file `vite build` wrote, and the page for any other path. Every answer carries the hub's headers, and HSTS when `ROBKIT_CORE_URL` is https.
