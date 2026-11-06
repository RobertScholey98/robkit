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
- The reader doesn't throw or exit. Its caller decides what a problem means: core and the dev runner refuse to start, a command throws its message as a `Problem` from `@robkit/dev/cli` (see `errors.md`), and an HTTP route answers 400.
- When several values are read together, report every problem at once with `allProblems`, a line each, so one run shows everything to fix.
- A value with a meaning beyond its type gets a brand that only its reader makes, so a function that takes one can't be handed a string nobody checked:

  | Brand    | What it is                     | Made by                                                              |
  | -------- | ------------------------------ | -------------------------------------------------------------------- |
  | `Slug`   | An app's slug                  | `readSlug`                                                           |
  | `RoleId` | A role's id                    | `readRoleId`, `readRoleIds` and `readAccessRule`, and core's readers |
  | `CodeId` | An access code's id, a guest's | `readCodeId`, and core's readers                                     |

  `Slug` is in `@robkit/session/addresses`, and an install's `host` and `origin` take one. `RoleId` and `CodeId` are in `@robkit/guard`. Core's schema types its id columns with them, since core makes every id it stores.

The shared readers live in `@robkit/session/input` (environment variables and JSON, and `InputProblem`, `isProblem`, `isRecord` and `allProblems`), `@robkit/session/app-env` (what an app's server reads from its environment), `@robkit/session/manifest` (an app's `robkit` field), `@robkit/session/addresses` (slugs) and `@robkit/guard` (role and code ids, and access rules). Every robkit package and every app can import them. robkit's repo checks read their JSON files with `readJsonFile(path, read)` and `readManifest` in `tooling/repo-checks/src/manifest.ts`.

## What lint enforces

| Rule                                          | Fails on                                                                                           | Where                |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| `@typescript-eslint/no-unsafe-type-assertion` | A cast that narrows a type                                                                         | Every file but tests |
| `robkit/no-json-cast`                         | A cast of `JSON.parse(...)` or a `.json()` result, which are `any` and so slip past the rule above | Every file but tests |
| `robkit/one-problem-type`                     | A type literal whose only property is a required `error: string`, and `"error" in`                 | Every file           |

The rules live in `tooling/eslint`, each with its tests. An install's `eslint.config.js` refuses the same three with `no-restricted-syntax` selectors, so the templates and every app `robkit add` writes keep to them too.

## Example

`readServeEnv` in `@robkit/session/app-env` reads where a server listens:

```ts
import {
  allProblems,
  isProblem,
  readHost,
  readPort,
  type Env,
  type InputProblem,
} from "@robkit/session/input";

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
import { isProblem } from "@robkit/session/input";
import { readServeEnv } from "@robkit/session/app-env";
import { Hono } from "hono";

const app = new Hono(); // the app's routes go here

const listen = readServeEnv(process.env);
if (isProblem(listen)) {
  console.error(listen.error);
  process.exit(1);
}
const { host: hostname, port } = listen;
serve({ fetch: app.fetch, hostname, port });
```

With `PORT=80000` the app prints this and stops:

```text
PORT is "80000", which isn't a port. Set it to a whole number from 1 to 65535, or leave it unset for 3000.
```

## Tests

Test each reader through its return value. Cover a good value, then each bad shape that applies: malformed text, `null`, the wrong shape, a missing key, and a value out of range. Assert the whole message, so a change to what the owner reads shows in the diff.
