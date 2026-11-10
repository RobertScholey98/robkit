---
"@robkit/dev": minor
"create-robkit": minor
---

`pnpm robkit add` starts the new app in a running `pnpm dev`, so you no longer stop `pnpm dev` first. The runner listens on a socket file in a folder only you can open, takes one request at a time, and adds the app on a port no running app holds, without changing any running app's password. It starts a new core so the launcher lists the app, and moves core's route to it before the old one stops, so every app reaches core throughout. An app that fails as it starts prints its problem, and every other app keeps answering. `@robkit/dev/cli` exports `askDev` and `devSocket`.
