---
"@robkit/dev": minor
"create-robkit": minor
---

`pnpm robkit add` starts the new app in a running `pnpm dev`, so you no longer stop `pnpm dev` first. The runner listens on a socket file in a folder only you can open, takes one request at a time, and adds the app on a port no running app holds, without changing any running app's password. It starts a new core so the launcher lists the app, and moves core's route to it before the old one stops, so every app reaches core throughout. If the new core exits or doesn't answer in five minutes, the runner keeps the core it had, stops the new app and says why. An app that fails as it starts prints its problem, and every other app keeps answering. `@robkit/dev/cli` exports `askDev` and `devSocket`.

`robkit add`, `robkit migrate` and `robkit upgrade` look for the socket only in a folder that is yours alone, as `pnpm dev` listens only in one. In a folder another account owns, or others can open, they say so and ask nothing.

Stopping `pnpm dev` stops a migration it is running, whether it began as `pnpm dev` started or `robkit` asked for it later.
