# @internal/test-postgres

A private Postgres for each test suite that needs one, and the clean-up that removes it however the suite ends. Core's and dev's `*.db.test.ts` files and the whole-stack test use it. It is private and never published.

Every test here needs Docker and Linux, so `pnpm check` skips this package and `pnpm check:all` runs it.

## How a suite gets its Postgres

A Vitest global setup calls `startPostgres()` once, hands the suite its address with `project.provide`, and returns `stop`. Core's `src/test/global-setup.ts`, cut down:

```ts
import { startPostgres } from "@internal/test-postgres";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    adminUrl: string;
  }
}

export default async function setup(project: TestProject) {
  const { adminUrl, stop } = await startPostgres();
  project.provide("adminUrl", adminUrl);
  return stop;
}
```

A test reads it with `inject("adminUrl")`.

`startPostgres()`:

1. Picks a port with `freePostgresPort()`, which skips every port Docker already publishes. Docker Desktop publishes ports from its own VM, where `freePort()` can't see them.
2. Starts the install template's own `compose.yaml` (`composeFile`), so tests run the Postgres an install's `pnpm dev` runs, under a project named `robkit-test-<random>`.
3. Adds `in-memory.yaml` to `COMPOSE_FILE` (`testComposeFiles()`), which keeps the data on tmpfs. Dozens of first boots syncing to disk stalled the gate in WSL.
4. Registers the project with `removeWhenGone`, then waits for Postgres to be healthy (`docker compose up -d --wait`).

It answers `{ adminUrl, project, stop }`. `adminUrl` is the superuser URL for the `robkit` database.

## Exports

| Export                                     | What it is                                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `startPostgres()`, `TestPostgres`          | A private Postgres, as above                                                                               |
| `composeFile`                              | The install template's `compose.yaml`                                                                      |
| `testComposeFiles(env?)`                   | `COMPOSE_FILE` for a test: what `COMPOSE_FILE` already names, or `compose.yaml`, then `in-memory.yaml`     |
| `freePort()`, `freePostgresPort()`         | A port nothing listens on; one that Docker doesn't publish either                                          |
| `freePortBlock(size)`                      | `size` free ports in a row, below the OS's ephemeral range, for `robkit-dev`'s proxy and the apps after it |
| `publishedPorts()`                         | The host ports Docker publishes now                                                                        |
| `removeWhenGone(...leftovers)`, `Leftover` | Removes what a test started once its process exits, however it ends                                        |
| `testTag()`                                | A new `ROBKIT_TEST_TAG`, for a process a test starts                                                       |

## Clean-up

A test's own teardown doesn't run when turbo stops a failed run or a test worker is killed, and a Postgres left behind slows Docker for every run after it. So a test registers what it starts with `removeWhenGone`, and a detached watcher (`src/watcher.ts`), outside the test's process group, waits for the test process to exit, then removes it:

- `{ docker: prefix }`: containers, networks and volumes named `<prefix>-…` or `<prefix>_…`, as Compose names them, and images named `<prefix>/…`, as the production test names the ones it builds.
- `{ tagged: tag }`: every process whose environment holds `ROBKIT_TEST_TAG=<tag>`. A process inherits the tag, so this reaches every app a `pnpm dev` started, even in a process group of its own. They get SIGTERM, then SIGKILL after 15 seconds.

## When a suite's Postgres won't start

`startPostgres()` removes what it started, then throws Compose's error. Look at what Compose said first.

- **`Cannot connect to the Docker daemon`.** Docker isn't running, or WSL can't see it. Start Docker Desktop and turn on its WSL integration for your distro. `docker info` must work in the shell that runs the tests.
- **A pull fails naming `docker-credential-desktop.exe`.** Docker Desktop's credential helper doesn't run inside WSL. Point `DOCKER_CONFIG` at a folder holding an empty `config.json`, as [CONTRIBUTING's WSL steps](../../CONTRIBUTING.md#on-windows-use-wsl) show.
- **`port is already allocated`.** Something took the port between `freePostgresPort()` and Compose. Rerun the suite.
- **`dependency failed to start: container … is unhealthy`.** Postgres didn't pass its health check. Run the template's Postgres by hand and read its log:

  ```sh
  cd packages/create-robkit/templates/base
  ROBKIT_POSTGRES_PORT=54399 docker compose -p robkit-debug up -d --wait
  docker compose -p robkit-debug logs postgres
  docker compose -p robkit-debug down -v
  ```

- **Leftover `robkit-test-*` containers** after a machine crashed mid-run. `docker ps -a --filter name=robkit-test-` lists them; `docker rm -f` removes them.

[docs/testing.md](../../docs/testing.md) covers every suite that starts Docker.
