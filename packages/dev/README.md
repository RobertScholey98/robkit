# @robkit/dev

The `robkit-dev` runner behind an install's `pnpm dev`.

`robkit-dev` finds every app under `apps/`, starts Postgres with Docker Compose, gives each app with a `migrate` script its own schema and role, runs that script, starts every app, and puts a proxy on port 3000 in front so each app answers on `<slug>.robkit.localhost`. The proxy listens on `127.0.0.1`, and on `::1` where the machine has it, so only this machine reaches it. It stops everything on Ctrl+C, or as soon as any app exits.

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

## Exports

`@robkit/dev` holds what an install and create-robkit use beside the runner:

| Export                                               | What it is                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `robkit-dev` (bin)                                   | The runner                                                        |
| `appManifestFileIn(root, folder)`, `AppManifestFile` | An app's `package.json`: its name, scripts and manifest           |
| `discoverApps(root)`, `App`                          | The apps under `apps/`, refusing a folder whose name isn't a slug |
| `catalogOf(apps)`                                    | `ROBKIT_APPS`: each app's slug and manifest, as JSON              |

`@robkit/dev/cli` holds what robkit's command lines share. create-robkit's `create-robkit` and `robkit` bins and `robkit-dev` use it:

| Export                                                          | What it is                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runCommand(main, report?)`, `CommandProblem`, `reportFaultsAt` | Re-exported from `@robkit/input/command`. Runs a command line: a thrown `CommandProblem` prints its message and exits 1, as do several in an `AggregateError`; anything else prints a line saying it's a bug and where to report it, then the error with its stack. `report` is a `Report` from `@robkit/input/report`, `reportToConsole` by default |
| `exec(command, args, { cwd, env, slug?, quiet? })`              | Runs a command to completion, its output prefixed with `slug`, or going nowhere when `quiet`. A failure is a `CommandProblem` naming the command, its folder and its exit code                                                                                                                                                                       |
| `isMissing(error)`                                              | Whether an error says a file or folder isn't there                                                                                                                                                                                                                                                                                                   |
| `requireGo(env?)`                                               | Checks that `go` starts, for a React + Go app. Otherwise a `CommandProblem` says how to install Go. `robkit-dev` runs it when an app has a `go.mod`, and init and `robkit add` for the Go stack                                                                                                                                                      |

## What it must never do

- Import `@robkit/core`. It starts core as a process like any other app.
- Run on Windows outside WSL. It stops each app's process group with POSIX signals, so it needs Linux or macOS.

## For contributors

- An app with a `migrate` script gets its own schema and role from `provisionApps`, which gives it one with `@robkit/provision` and then runs that script. `pnpm dev` runs the step before it starts the apps. The runner and the step run each app's scripts with pnpm.
- `src/app-env.ts` holds every variable the runner sets for an app, over the shell's environment.
- The runner tells each app its slug as `ROBKIT_APP`, and hands core the owner's apps as `ROBKIT_APPS`, a JSON list of each app's slug and what its manifest declares: the `robkit` field of its `package.json`, with who may open it (roles by name) and an emoji for the launcher.
- `checkBeforeStart` in `src/checks.ts` runs before Compose starts, and outside the runner's stop, so a second `pnpm dev` stops nothing the first runs. It asks Docker for its version, then tries to listen on each port and closes at once. A Postgres port published by this install's own Compose service passes, since `compose up` takes that container over; one published by any other container fails, even where Docker publishes from a VM of its own and the port looks free.
