---
"@robkit/dev": patch
---

The dev proxy ends a browser's request when its app dies or restarts mid-answer, rather than leave it waiting.

The dev proxy listens on `127.0.0.1`, and on `::1` where the machine has it, and on no other address.

`robkit-dev` run in a folder with no `robkit.json` says in one line that it isn't an install.

`robkit-dev` reads the `ROBKIT_` names in the install's root `.env`, as Compose does, so `ROBKIT_POSTGRES_PORT` there moves Postgres and the runner together. A value the shell exports wins over the file's.

Before it starts anything, `robkit-dev` checks that Docker answers and that the proxy's, each app's and Postgres's ports are free. Each failure prints one line that says what to do, and a second `pnpm dev` in the same install exits 1 and leaves the first running.

A failed `compose up` is reported alone, not with the `compose stop` that follows it.

`robkit-dev` sets `HOST` to `127.0.0.1` for core and every app, so a `HOST` the shell exports no longer moves them off loopback.

`robkit-dev` prints each app's address once that app answers, rather than all of them as soon as it starts the apps, so the first request gets the app and not the proxy's "is not answering".

Closing the terminal stops every app, the proxy and Postgres: `robkit-dev` stops on SIGHUP as on SIGINT, and ignores a failed write to its closed output. `exec` from `@robkit/dev/cli` takes `quiet`, which sends the command's output nowhere.
