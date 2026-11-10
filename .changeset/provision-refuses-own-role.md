---
"@robkit/provision": minor
"@robkit/dev": patch
---

The provision step refuses an app named after the role it connects as, or after any superuser, and changes nothing. It used to alter that role. `pnpm dev` prints a message that names the app.
