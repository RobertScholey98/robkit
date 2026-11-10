---
"@robkit/dev": patch
---

`robkit-dev` runs each app's `migrate` script with the app's own settings, `ROBKIT_APP` and `PORT` among them, as the app's start script in an image already does.

`robkit-dev` loads `apps/<slug>/.env`, if it exists, into that app's environment and its `migrate` script's, and no other app's. What the runner sets wins, then the shell, then the file. The file is read when `pnpm dev` starts, with Node's own parser, and nothing in the runner's own environment changes.

An app's `.env` can't set a name `robkit-dev` decides for each app (`DATABASE_URL`, `PORT`, `HOST`, `VITEST` and its `ROBKIT_` settings), any other name that starts `ROBKIT_`, or `NODE_ENV`. A file that tries stops `pnpm dev` before it starts anything, with a line that names the file and the variable.

`robkit-dev` sets `NEXT_TELEMETRY_DISABLED=1` for an app only where neither the shell nor the app's `.env` sets it, so either can turn Next's telemetry back on.
