---
"@robkit/dev": patch
---

`robkit-dev` runs each app's `migrate` script with the app's own settings, `ROBKIT_APP` and `PORT` among them, as the app's start script in an image already does.

`robkit-dev` loads `apps/<slug>/.env`, if it exists, into that app's environment and its `migrate` script's, and no other app's. What the runner sets wins, then the shell, then the file. The file is read when `pnpm dev` starts, with Node's own parser, and nothing in the runner's own environment changes.
