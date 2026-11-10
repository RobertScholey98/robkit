# @robkit/dev

The `robkit-dev` runner behind an install's `pnpm dev`.

`robkit-dev` finds every app under `apps/`, starts Postgres with Docker Compose, gives each app with a `migrate` script its own schema and role, runs that script, starts every app, and puts a proxy on port 3000 in front so each app answers on `<slug>.robkit.localhost`. The proxy listens on `127.0.0.1`, and on `::1` where the machine has it, so only this machine reaches it. It stops everything on Ctrl+C, when its terminal closes, or as soon as any app that has answered exits.

While it runs, `robkit add` and `robkit migrate` ask it to start a new app or migrate one, over a socket file in a folder only the owner can open. See "For contributors" below.

Every install runs it as `pnpm dev`. It gives each app its database with `@robkit/provision`, which core also runs in production.

## Example

An install's root `package.json`:

```json
{
  "scripts": { "dev": "robkit-dev" },
  "devDependencies": { "@robkit/dev": "catalog:" }
}
```

`robkit-dev` reads `ROBKIT_DOMAIN` (default `robkit.localhost`), `ROBKIT_DEV_PORT` (default `3000`) and `ROBKIT_POSTGRES_PORT` (default `54320`), from the shell or from the install's root `.env`. Compose reads that file too, and the shell wins over it for both. It serves plain http, so it refuses a domain that isn't `localhost` or a name under it. It tells each app its slug as `ROBKIT_APP` and core's address as `ROBKIT_CORE_URL`, sets `HOST` to `127.0.0.1` so every app listens on loopback, and hands core every app's manifest as `ROBKIT_APPS`.

An app's own settings go in `apps/<slug>/.env`. `robkit-dev` reads it as it starts, with Node's own parser, and gives it to that app and its `migrate` script alone. Its own settings win, then the shell's, then the file's. A file that sets a name it decides (`DATABASE_URL`, `PORT`, `HOST`, `VITEST` or any `ROBKIT_` name), or `NODE_ENV`, stops it with a line that names the file and the variable. It sets `NEXT_TELEMETRY_DISABLED=1` only where neither the shell nor the file does.

## Exports

`@robkit/dev` holds what an install and create-robkit use beside the runner:

| Export                                               | What it is                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `robkit-dev` (bin)                                   | The runner                                                        |
| `appManifestFileIn(root, folder)`, `AppManifestFile` | An app's `package.json`: its name, scripts and manifest           |
| `discoverApps(root)`, `App`                          | The apps under `apps/`, refusing a folder whose name isn't a slug |
| `catalogOf(apps)`                                    | `ROBKIT_APPS`: each app's slug and manifest, as JSON              |

`@robkit/dev/cli` holds what robkit's command lines share. create-robkit's `create-robkit` and `robkit` bins and `robkit-dev` use it:

| Export                                                                   | What it is                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runCommand(main, report?)`, `CommandProblem`, `reportFaultsAt`          | Re-exported from `@robkit/input/command`. Runs a command line: a thrown `CommandProblem` prints its message and exits 1, as do several in an `AggregateError`; anything else prints a line saying it's a bug and where to report it, then the error with its stack. `report` is a `Report` from `@robkit/input/report`, `reportToConsole` by default         |
| `exec(command, args, { cwd, env, slug?, quiet?, signal? })`              | Runs a command to completion, its output prefixed with `slug`, or going nowhere when `quiet`. A failure is a `CommandProblem` naming the command, its folder and its exit code. When `signal` aborts, it stops the command and every process it started, and returns with no error                                                                           |
| `isMissing(error)`                                                       | Whether an error says a file or folder isn't there                                                                                                                                                                                                                                                                                                           |
| `requireGo(env?)`                                                        | Checks that `go` starts, for a React + Go app. Otherwise a `CommandProblem` says how to install Go. `robkit-dev` runs it when an app has a `go.mod`, and init and `robkit add` for the Go stack                                                                                                                                                              |
| `askDev(root, request, env?)`, `DevRequest`, `DevOperation`, `DevAnswer` | Asks the `pnpm dev` running in the install at `root` to `add` or `migrate` one app, and resolves with its answer: `done` or `refused` with a line to print, or `not-running` at once when no `pnpm dev` answers. `robkit add` and `robkit migrate` use it. It refuses, with a `CommandProblem`, a socket folder that another account owns or others can open |
| `devRunning(root, env?)`                                                 | Whether a `pnpm dev` runs in the install at `root`: whether something takes a connection on its socket. It sends nothing, says no on native Windows, and refuses the folders `askDev` refuses. `robkit upgrade` refuses while one runs                                                                                                                       |
| `devSocket(root, env)`, `DevSocket`                                      | Where `pnpm dev` in the install at `root` listens: a `robkit-<uid>` folder in `XDG_RUNTIME_DIR`, or in the temp folder where that isn't set, and a name hashed from the install's real path. The runner and `askDev` both work it out here                                                                                                                   |

## What it must never do

- Import `@robkit/core`. It starts core as a process like any other app.
- Run on Windows outside WSL. It stops each app's process group with POSIX signals, so it needs Linux or macOS.

## For contributors

- An app with a `migrate` script gets its own schema and role from `provisionApps`, which gives it one with `@robkit/provision` and then runs that script. `pnpm dev` runs the step before it starts the apps. The runner and the step run each app's scripts with pnpm.
- `src/app-env.ts` holds every variable the runner sets for an app, over the shell's environment. `appSettings` is the one list: an app's `.env` can't set any of its names, so a setting added there is refused in the file too. `appEnv` gives an app and its `migrate` script their environment, and `ownSettings` reads each app's `.env` and refuses what it can't set.
- The runner tells each app its slug as `ROBKIT_APP`, and hands core the owner's apps as `ROBKIT_APPS`, a JSON list of each app's slug and what its manifest declares: the `robkit` field of its `package.json`, with who may open it (roles by name) and an emoji for the launcher.
- A running `pnpm dev` takes requests on a socket file, not a port: any web page can send a request to a port on `127.0.0.1`, and no browser can open a socket file, so it needs no token. `src/requests.ts` holds what both sides share: where the socket is (`devSocket`), the request's reader and `askDev`. `src/request-server.ts` makes the folder with mode 0700. `socketFolderIsOwn` in `src/requests.ts` refuses one that another account owns or others can open. The runner, `askDev` and `devRunning` all call it, so a command asks nothing of a socket another account put there. The folder is robkit's own even in `XDG_RUNTIME_DIR`, which every account can open under WSL without systemd. The runner takes the socket by listening on it, so of two started together one is refused. Where the address is in use and nothing answers, a killed run left the file, and the runner removes it and listens again. It reads one line of at most 1024 bytes per connection, and hands requests to the runner one at a time. A request is `{"operation":"add" | "migrate","slug":"<slug>"}` and nothing else, and the answer is one line, `done` or `refused`, with no command, path or URL. `askDev` reads at most 64 KB of it.
- An `add` reads `apps/<slug>` itself, gives the app the first port after the proxy's that no running app holds, provisions it alone (provisioning every app would give each a new password), runs its `migrate` script, starts it and waits for it to answer. Until then its exit stops nothing else. Then the runner starts a new core, so `ROBKIT_APPS` lists the app, on a free port. Once it answers, the proxy sends core's host to it and the old core's whole process group stops, so every guard finds a core answering throughout. A new core that exits, or doesn't answer within five minutes, is stopped: the runner keeps the core it had, stops the added app and refuses the add. Then the runner routes the app. A `migrate` runs the app's script with the `DATABASE_URL` the runner gave it at start. Stopping `pnpm dev` stops a migration that is running.
- `checkBeforeStart` in `src/checks.ts` runs before Compose starts, and outside the runner's stop, so a second `pnpm dev` stops nothing the first runs. It asks Docker for its version, then tries to listen on each port and closes at once. A Postgres port published by this install's own Postgres container passes, since `compose up` takes that container over; one published by any other container fails, even where Docker publishes from a VM of its own and the port looks free.
