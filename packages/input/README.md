# @robkit/input

Readers for input from outside robkit's own code: environment variables, JSON, an app's slug and its manifest. Each takes the raw value and returns the typed value or an `InputProblem` that says what to fix. `docs/conventions/input.md` says how robkit uses them. Its subpaths hold the manifest format, an install's addresses, the headers robkit sends, `Report` and the command lines' handler, which robkit's packages share.

Every robkit package and every app can import it. It imports nothing, so the browser can load it.

## Example

An app's `serve.ts` reads where to listen once, at start. `orExit` gives back the value, or prints the problem alone and exits 1:

```ts
import { orExit, readServeEnv } from "@robkit/input";

const listen = orExit(readServeEnv(process.env));
console.log(`listening on ${listen.host}:${String(listen.port)}`);
```

With `PORT=80000` it prints this, with no stack, and stops:

```text
PORT is "80000", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.
```

## Exports

`@robkit/input`, the reading primitives:

| Export                                                                                           | What it is                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `InputProblem`, `problem(message)`, `isProblem`                                                  | The one type for a failed read, `{ error }`, its one maker, and the one check for it                                                                            |
| `allProblems(...reads)`                                                                          | Every problem among several reads as one, a line each                                                                                                           |
| `orExit(read)`                                                                                   | The value, or its problem printed alone and the process ended with 1, for an app's server or script as it starts                                                |
| `orThrow(read)`                                                                                  | The value, or its problem thrown as an `Error`, for a place that can't go on without it and prints what it throws, such as a Vite config                        |
| `isRecord(value)`                                                                                | Whether a value is a plain object                                                                                                                               |
| `parseJson(text, source)`                                                                        | `{ json }`, typed `unknown`, or a problem naming `source`                                                                                                       |
| `Env`                                                                                            | A process's environment, such as `process.env`                                                                                                                  |
| `readSet`, `readPort`, `readHost`, `readDomain`, `readCoreUrl`, `readAppSlug`, `readDatabaseUrl` | One variable each. An empty variable counts as unset. `readDomain` lower-cases the domain, and `readCoreUrl` refuses http unless the install is local           |
| `isDomain(value)`                                                                                | Whether a string is a domain alone. With `readDomain`, the only maker of a `Domain`                                                                             |
| `readServeEnv`, `readDevServerEnv`, `readGuardEnv`                                               | What an app's server reads, each read whole: where it listens, what its Vite dev server needs, and its slug and core's origin, which the guard now reads itself |
| `readSlug(value)`, `Slug`, `slugProblem(name)`                                                   | An app's slug: lowercase letters and digits, starting with a letter. Only `readSlug` makes a `Slug`                                                             |
| `platformApps`, `isPlatformApp`, `PlatformApp`                                                   | Core, the hub and admin, whose names are slugs as they stand                                                                                                    |

### `@robkit/input/manifest`

The manifest format: what an app declares in its `package.json`'s `robkit` field, and each app as `ROBKIT_APPS` hands it to core.

| Export                                             | What it is                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `readAppManifest`, `AppManifest`, `ManifestAccess` | What an app's `robkit` field declares: its access rule, with roles by name, and its icon |
| `appManifestJson`                                  | The manifest as the `robkit` field and `ROBKIT_APPS` write it                            |
| `readListedApp`, `ListedApp`                       | One app in `ROBKIT_APPS`: its slug and what it declares                                  |

### `@robkit/input/addresses`

Where an install's apps answer. Each app is on `<slug>.<domain>`, so one domain gives every address. Core, the guard, the hub, admin, the dev runner, init and the whole-stack test all take their addresses from it. The hub finds core from its own address (`templates/base/apps/hub/src/core-origin.ts`):

```ts
import { installAt } from "@robkit/input/addresses";

installAt("http://hub.robkit.localhost:3000/", "hub")?.origin("core");
// "http://core.robkit.localhost:3000"
```

| Export                                | What it is                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `install({ domain, protocol, port })` | An install's addresses, from a `Domain`: each app's `host` and `origin`, which take a `Slug`, `onInstall(url)`, `appOf(url)`, and `appAt(url)`, the app whose exact origin `url` is on, protocol and port included |
| `installAt(url, app)`                 | The install `url` is on, given that it is `app`'s address                                                                                                                                                          |
| `isLocal(domain)`                     | Whether the domain is `localhost` or under it, the only kind of install that may run over plain http                                                                                                               |
| `defaultDomain`, `defaultDevPort`     | `robkit.localhost` and `3000`                                                                                                                                                                                      |
| `coreInstall(core)`                   | The install core's origin is on. Takes a `CoreOrigin` from `readCoreUrl`                                                                                                                                           |

### `@robkit/input/headers`

The headers robkit sends with an answer, written here and nowhere else in TypeScript. The guard, core, `robkit()` for the hub in dev, and the hub's server all take them from here. `@robkit/session` re-exports them for the adapters. Go's port writes the same values in `go/session`; change both together.

| Export                                        | What it is                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `securityHeaders(origin, framers)`, `Framers` | `nosniff`, HSTS when `origin` is https, and who may frame the answer: `same-origin`, `none`, or `undefined` for a redirect, which gets no framing header |
| `withHeaders(response, headers)`              | `response` with each of `headers` it lacks, copied first when its headers can't change                                                                   |
| `isRedirect(status)`                          | Whether `status` sends the browser on                                                                                                                    |

### `@robkit/input/report`

| Export            | What it is                                                                         |
| ----------------- | ---------------------------------------------------------------------------------- |
| `Report`          | The one shape for reporting a fault nobody calling can handle, `(message, cause?)` |
| `reportToConsole` | Its default, which prints the message, then the cause with its stack               |

Core's `logError`, the guard's default `onUnavailable` and `runCommand` all report through it (see `docs/conventions/errors.md`).

### `@robkit/input/command`

The one top-level handler of robkit's command lines. `@robkit/dev/cli` re-exports it.

| Export                      | What it is                                                                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runCommand(main, report?)` | Runs a command line and returns its exit code. A thrown `CommandProblem` prints its message alone and exits 1. Anything else prints a line saying it's a bug and where to report it, then the error with its stack |
| `CommandProblem`            | A problem the person running the command can fix. Its message says what to do                                                                                                                                      |
| `reportFaultsAt`            | Where a fault robkit didn't expect gets reported                                                                                                                                                                   |

## What it must never do

- Import anything: another package, or Node's own modules. The browser loads it, and every robkit package depends on it.
- Throw or exit on bad input. A reader returns a problem, and its caller decides what that means, such as with `orExit` or `orThrow`.
- Do I/O, apart from `orExit`'s one line and exit, which only a server calls, and `reportToConsole`'s lines on stderr.
- Show a database URL in a problem. It may hold a password.
