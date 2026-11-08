# @robkit/dev

The `robkit-dev` runner behind an install's `pnpm dev`, and the provision step that gives each app its database.

`robkit-dev` finds every app under `apps/`, starts Postgres with Docker Compose, gives each app with a `migrate` script its own schema and role, runs that script, starts every app, and puts a proxy on port 3000 in front so each app answers on `<slug>.robkit.localhost`. It stops everything on Ctrl+C, or as soon as any app exits.

Every install runs it as `pnpm dev`. In production, core's container runs the provision step from it before core starts.

## Example

An install's root `package.json`:

```json
{
  "scripts": { "dev": "robkit-dev" },
  "devDependencies": { "@robkit/dev": "catalog:" }
}
```

An install's `apps/core/src/provision.ts`, which runs in production:

```ts
import { provisionDatabases, readProvisionConfig } from "@robkit/dev";
import { isProblem } from "@robkit/input";

// ROBKIT_ADMIN_DATABASE_URL, ROBKIT_DB_SECRET, and ROBKIT_DATABASES, which
// lists the apps with a database, such as "example,notes".
const config = readProvisionConfig(process.env);
if (isProblem(config)) {
  console.error(config.error);
  process.exit(1);
}

await provisionDatabases(config);
console.log(`provisioned ${config.slugs.join(", ")}`);
```

`robkit-dev` reads `ROBKIT_DOMAIN` (default `robkit.localhost`) and `ROBKIT_DEV_PORT` (default `3000`). It tells each app its slug as `ROBKIT_APP` and core's address as `ROBKIT_CORE_URL`, and hands core every app's manifest as `ROBKIT_APPS`.

## Exports

`@robkit/dev` holds what an install and create-robkit use beside the runner:

| Export                                               | What it is                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `robkit-dev` (bin)                                   | The runner                                                               |
| `appManifestFileIn(root, folder)`, `AppManifestFile` | An app's `package.json`: its name, scripts and manifest                  |
| `readProvisionConfig(env)`, `ProvisionConfig`        | The production provision step's environment                              |
| `discoverApps(root)`, `App`                          | The apps under `apps/`, refusing a folder whose name isn't a slug        |
| `catalogOf(apps)`                                    | `ROBKIT_APPS`: each app's slug and manifest, as JSON                     |
| `provisionDatabases(options)`                        | The provision step in production, with passwords from `ROBKIT_DB_SECRET` |
| `databasePassword(secret, slug)`, `databaseUrl`      | An app's role password (an HMAC of its slug) and its `DATABASE_URL`      |

`@robkit/dev/cli` holds what robkit's command lines share. create-robkit's `create-robkit` and `robkit` bins and `robkit-dev` use it:

| Export                                                          | What it is                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `runCommand(main, report?)`, `CommandProblem`, `reportFaultsAt` | Runs a command line: a thrown `CommandProblem` prints its message and exits 1; anything else prints a line saying it's a bug and where to report it, then the error with its stack. `report` is a `Report` from `@robkit/input/report`, `reportToConsole` by default |
| `exec(command, args, { cwd, env, slug? })`                      | Runs a command to completion. A failure is a `CommandProblem` naming the command, its folder and its exit code                                                                                                                                                       |
| `isMissing(error)`                                              | Whether an error says a file or folder isn't there                                                                                                                                                                                                                   |
| `requireGo(env?)`                                               | Checks that `go` starts, for a React + Go app. Otherwise a `CommandProblem` says how to install Go. `robkit-dev` runs it when an app has a `go.mod`, and init and `robkit add` for the Go stack                                                                      |

## What it must never do

- Import `@robkit/core`. It starts core as a process like any other app.
- Run on Windows outside WSL. It stops each app's process group with POSIX signals, so it needs Linux or macOS.
- Give an app's role access to another schema. Each role reaches its own schema and nothing else.

## For contributors

- An app with a `migrate` script gets its own schema and role from the provision step, `provisionApps`, which then runs that script. `pnpm dev` runs the step before it starts the apps. The runner and the step run each app's scripts with pnpm.
- The runner tells each app its slug as `ROBKIT_APP`, and hands core the owner's apps as `ROBKIT_APPS`, a JSON list of each app's slug and what its manifest declares: the `robkit` field of its `package.json`, with who may open it (roles by name) and an emoji for the launcher.
