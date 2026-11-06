# @robkit/input

Readers for input from outside robkit's own code: environment variables, JSON, an app's slug and its manifest. Each takes the raw value and returns the typed value or an `InputProblem` that says what to fix. `docs/conventions/input.md` says how robkit uses them.

Every robkit package and every app can import it. It imports nothing, so the browser can load it.

## Example

An app's `serve.ts` reads where to listen once, at start:

```ts
import { isProblem, readServeEnv } from "@robkit/input";

const listen = readServeEnv(process.env);
if (isProblem(listen)) {
  console.error(listen.error);
  process.exit(1);
}
console.log(`listening on ${listen.host}:${String(listen.port)}`);
```

With `PORT=80000` it prints:

```text
PORT is "80000", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.
```

## Exports

| Export                                                                                                           | What it is                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `InputProblem`, `isProblem`                                                                                      | The one type for a failed read, `{ error }`, and the one check for it                                                                       |
| `allProblems(...reads)`                                                                                          | Every problem among several reads as one, a line each                                                                                       |
| `isRecord(value)`                                                                                                | Whether a value is a plain object                                                                                                           |
| `parseJson(text, source)`                                                                                        | `{ json }`, typed `unknown`, or a problem naming `source`                                                                                   |
| `Env`                                                                                                            | A process's environment, such as `process.env`                                                                                              |
| `readSet`, `readPort`, `readHost`, `readDomain`, `readCoreUrl`, `readAppSlug`, `readDatabaseUrl`                 | One variable each. An empty variable counts as unset                                                                                        |
| `isDomain(value)`                                                                                                | Whether a string is a domain alone                                                                                                          |
| `readServeEnv`, `readDevServerEnv`, `readGuardEnv`                                                               | What an app's server reads, each read whole: where it listens, what its Vite dev server needs, and its slug and core's origin for the guard |
| `readSlug(value)`, `Slug`, `slugProblem(name)`                                                                   | An app's slug: lowercase letters and digits, starting with a letter. Only `readSlug` makes a `Slug`                                         |
| `platformApps`, `isPlatformApp`, `PlatformApp`                                                                   | Core, the hub and admin, whose names are slugs as they stand                                                                                |
| `readAppDeclaration`, `appDeclarationJson`, `readDeclaredApp`, `AppDeclaration`, `DeclaredApp`, `DeclaredAccess` | The manifest format: what an app declares in its `package.json`'s `robkit` field, and each app as `ROBKIT_APPS` hands it to core            |

## What it must never do

- Import anything: another package, or Node's own modules. The browser loads it, and every robkit package depends on it.
- Throw or exit on bad input. A reader returns a problem, and its caller decides what that means.
- Show a database URL in a problem. It may hold a password.
