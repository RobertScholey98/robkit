---
"@robkit/dev": patch
---

The dev proxy ends a browser's request when its app dies or restarts mid-answer, rather than leave it waiting.

The dev proxy listens on `127.0.0.1`, and on `::1` where the machine has it, and on no other address.

`robkit-dev` run in a folder with no `robkit.json` says in one line that it isn't an install.

`robkit-dev` reads the `ROBKIT_` names in the install's root `.env`, as Compose does, so `ROBKIT_POSTGRES_PORT` there moves Postgres and the runner together. A value the shell exports wins over the file's.
