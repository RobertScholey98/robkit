# Reading input

Every value that comes from outside robkit's own code goes through a reader once, where it enters. That covers files, environment variables, command arguments, HTTP bodies and token claims. Code past the reader trusts the type and checks nothing again.

## The rule

A reader takes the raw value and returns the typed value or an `InputProblem`:

```ts
interface InputProblem {
  readonly error: string;
}
```

- `InputProblem` is the only type for a failed read, and `isProblem` the only check for one. Don't write a `{ error: string }` of your own, and don't test a result with `"error" in`.
- The reader takes `unknown`, or `Env` for environment variables. It never casts. Parsed JSON is `unknown` until a reader checks it: give `JSON.parse` and `.json()` results the type `unknown`, then read them.
- The problem's `error` names the file or variable, the key, and what to do about it. Write it for the person who has to fix the input.
- The reader doesn't throw or exit. Its caller decides what a problem means: core and the dev runner refuse to start, a command throws its message as a `CommandProblem` from `@robkit/input/command` (see `errors.md`), and an HTTP route answers 400. An app's server or script that reads its environment as it starts calls `orExit(read)`, which returns the value or prints the problem alone and exits 1. Where the caller can't go on without the value, has nothing better to say and prints what it throws, such as a Vite config, `orThrow(read)` returns the value or throws the problem as an `Error`.
- When several values are read together, report every problem at once with `allProblems`, a line each, so one run shows everything to fix.
- A value with a meaning beyond its type gets a brand that only its reader makes, so a function that takes one can't be handed a string nobody checked:

  | Brand        | What it is                                              | Made by                                                              |
  | ------------ | ------------------------------------------------------- | -------------------------------------------------------------------- |
  | `Slug`       | An app's slug                                           | `readSlug`                                                           |
  | `Domain`     | An install's domain, such as `robkit.dev`               | `readDomain`                                                         |
  | `CoreOrigin` | Core's public origin, such as `https://core.robkit.dev` | `readCoreUrl`                                                        |
  | `RoleId`     | A role's id                                             | `readRoleId`, `readRoleIds` and `readAccessRule`, and core's readers |
  | `CodeId`     | An access code's id, a guest's                          | `readCodeId`, and core's readers                                     |

  `Slug`, `Domain` and `CoreOrigin` are in `@robkit/input`. An install's `host` and `origin` take a `Slug`, `requestGuard` takes core's origin as a `CoreOrigin`, and core's config holds its origin as a `CoreOrigin`. `RoleId` and `CodeId` are in `@robkit/guard`. Core's schema types its id columns with them, since core makes every id it stores.

The shared readers live in `@robkit/input`: environment variables and JSON, `InputProblem`, `isProblem`, `isRecord` and `allProblems`, slugs, what an app's server reads from its environment, and an app's `robkit` field. Role and code ids, and access rules, are read in `@robkit/guard`, which takes `InputProblem` from `@robkit/input`, so its readers return one like every other. `@robkit/input` imports nothing, so the guard stays pure and the browser can load it. Every robkit package and every app can import them. An install's `packages/core-client` reads core's answers with them, and its readers return an `InputProblem` like every other. robkit's repo checks read their JSON files with `readJsonFile(path, read)` and `readManifest` in `tooling/repo-checks/src/manifest.ts`.

## What lint enforces

| Rule                                          | Fails on                                                                                                                      | Where                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `@typescript-eslint/no-unsafe-type-assertion` | A cast that narrows a type                                                                                                    | Every file but tests |
| `robkit/no-json-cast`                         | A cast of `JSON.parse(...)` or a `.json()` result, which are `any` and so slip past the rule above                            | Every file but tests |
| `robkit/one-problem-type`                     | A type literal whose only property is a required `error: string`, and `"error" in`; outside tests, `throw new Error(x.error)` | Every file           |

The rules live in `tooling/eslint`, each with its tests. `policy.js` there holds every rule that doesn't know robkit's own packages, these three and the `catch` rules in [errors.md](errors.md) among them. create-robkit copies it, and each rule file it imports, into a new install's `tooling/eslint`, and the install's `eslint.config.js` lints with it. So the templates and every app `robkit add` writes keep to the same rules as robkit, and a create-robkit test lints the same samples with both configs to prove it.

Lint can't tell `typeof core !== "string"` on a reader's result from any other `typeof`, and it happens to work for a reader that returns a string. A repo check, `tooling/repo-checks/src/problem-checks.ts`, finds it by name in robkit's source, the templates and the docs, and fails.

## Example

`readServeEnv` in `@robkit/input` reads where a server listens:

```ts
import {
  allProblems,
  type Env,
  type InputProblem,
  isProblem,
  readHost,
  readPort,
} from "@robkit/input";

export function readServeEnv(
  env: Env,
): { host: string; port: number } | InputProblem {
  const host = readHost(env);
  const port = readPort(env, "PORT", 3000);
  if (isProblem(host) || isProblem(port)) {
    return allProblems(host, port);
  }
  return { host, port };
}
```

An app's `serve.ts` calls it once, at start:

```ts
import { serve } from "@hono/node-server";
import { orExit, readServeEnv } from "@robkit/input";
import { Hono } from "hono";

const app = new Hono(); // the app's routes go here

const { host: hostname, port } = orExit(readServeEnv(process.env));
serve({ fetch: app.fetch, hostname, port });
```

With `PORT=80000` the app prints this and stops:

```text
PORT is "80000", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.
```

A Vite config can't go on without the values it reads, and Vite prints what it throws, so it uses `orThrow`:

```ts
import { orThrow, readDevServerEnv } from "@robkit/input";

const { port, domain } = orThrow(readDevServerEnv(process.env));
console.log(port, domain);
```

## Tests

Test each reader through its return value. Cover a good value, then each bad shape that applies: malformed text, `null`, the wrong shape, a missing key, and a value out of range. Assert the whole message, so a change to what the owner reads shows in the diff.
