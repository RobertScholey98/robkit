# Errors

robkit sorts every failure into one of two kinds, and handles each kind one way.

## Expected failures are values

A failure the caller should handle, such as a wrong password, a taken slug or a guest without the role, is part of the function's return type. A result has one of two shapes:

- **A reader returns `T | InputProblem`**, and its caller checks it with `isProblem`. [input.md](input.md) says how.
- **Any other union of outcomes is tagged with `outcome`**, a string literal in each of its shapes, and the caller switches on it. Don't tell the shapes apart with `"key" in`, a boolean `ok`, or which fields are there.

The guard decides this way:

```ts
import type { Viewer } from "@robkit/guard";

type Decision =
  | { outcome: "allow"; viewer: Viewer }
  | { outcome: "login" }
  | { outcome: "refresh" }
  | { outcome: "not-found" };
```

So does `requestGuard`, which an adapter switches on. An answer it serves carries the guard's headers, which say who may frame it:

```ts
import { requestGuard } from "@robkit/session";

const check = requestGuard();

async function handle(request: Request): Promise<Response> {
  const decision = await check(request);
  switch (decision.outcome) {
    case "answer":
      return decision.response;
    case "serve":
      return new Response(`Hello, ${decision.viewer.kind}`, {
        headers: [...decision.headers],
      });
  }
}
```

Core's `claimInstall` returns `{ outcome: "taken" }` rather than throwing, and the route turns that into a 409. The hub's and admin's `callCore` answers `{ outcome: "ok", value }` or `{ outcome: "failed", error }`.

## Unexpected faults throw an `Error` with `cause`

A failure nobody can handle where it happens, such as a database that won't answer or a file that should exist, throws. When you throw because of another error, pass it on:

```ts
function parseApps(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("ROBKIT_APPS isn't JSON.", { cause: error });
  }
}
```

The message says what robkit was doing, with the detail that tells this failure from another: the table, the key, the file or the number of attempts. The cause keeps what went wrong underneath, so the log shows both. "Core couldn't store the session." gives the log nothing to go on; this does:

```ts
function storedRow<T>(row: T | undefined, what: string, table: string): T {
  if (row === undefined) {
    throw new Error(
      `Core couldn't store ${what}: the insert into ${table} returned no row.`,
    );
  }
  return row;
}
```

When callers need to tell faults apart, give the error a class. `CoreUnreachableError` in `@robkit/session` marks a call to core that got no answer, so the guard can report "network" rather than "core's key". `AccessRuleError`, beside it, marks a load of an app's access rule that core answered wrongly. Its `failure` says how: `unknown-app` (core answered 404), `bad-answer` (another error status, or JSON that isn't a rule), `invalid-json` or `interrupted-body`. Its cause keeps the JSON parser's or the body read's error. Neither class is exported: the guard's `GuardFault` says what they mean, below.

## Boundaries turn both into an answer

A boundary is where robkit meets a person or another program: an HTTP route, a command line, an adapter. It turns each failure into a response or an exit code, with a message that says what to do next.

- **Core.** A route answers an expected failure with its status and `{ error }` sentence. A body that isn't JSON gets "Send a valid JSON body.", and JSON that isn't an object gets "Send a JSON object." One `app.onError` handler catches every unexpected fault and gives it a fresh request id. It logs the route, the id and the cause through `logError`, and answers 500 with a generic JSON error that carries the id, as `requestId` and in an `X-Request-Id` header. The cause stays in core's log, not in the response; the id finds it there.
- **The guard.** It answers 503 when it can't check a request, rather than treating the viewer as signed out. It hands the cause to `onUnavailable` with the app's slug and what failed: `core-key`, `access-rule` or `network`. An `access-rule` fault also has a `reason`, the `AccessRuleError`'s `failure`, so `onUnavailable` can tell "core doesn't know this app" from a broken answer without reading the message. By default it reports them.
- **App servers.** An app's `serve.ts`, `server.ts`, `database.ts` and scripts read their environment with `orExit` from `@robkit/input`. A variable that won't do prints its problem alone and exits 1, so the owner sees the line that says how to fix it, not a stack. A Vite config uses `orThrow` instead, since Vite prints what it throws.
- **The guard's settings.** `guarded()` in every adapter, and `requestGuard()` and `coreOrigin()` in `@robkit/session`, read `ROBKIT_APP` and `ROBKIT_CORE_URL` themselves as the app's server starts, so they are an app server's boundary too and end the same way, through `orExit`. An `app` or `core` passed in code goes through the same reader, and its problem names the option, such as `guarded()'s core`. Go's `session.Guarded` returns the same problems as its error, and the template's `main` prints it and exits 1.
- **The hub and admin.** Their `callCore`, in an install's `packages/core-client`, answers `{ outcome: "ok", value }` or `{ outcome: "failed", error }`, with `error` a sentence to show. It reads core's answer with a reader that returns `T | InputProblem`. It tells `report(message, cause?)` what went wrong underneath: no answer, an answer that isn't JSON, or one the reader refuses, with the method, path, status and the reader's problem. It never passes on what core sent, so `JSON.parse`'s error, which quotes the answer, isn't the cause. `report` defaults to core-client's `reportToConsole`.
- **Command lines.** `create-robkit`, `robkit` and `robkit-dev` each run through `runCommand` from `@robkit/input/command`, which `@robkit/dev/cli` re-exports. It lives below the dev runner so a command that ships in an app's image needs nothing from it. Throw a `CommandProblem` for something the person can fix. It prints its message alone and exits 1, so the message must say what to do: "Set COOLIFY_TOKEN to deploy." Anything else is a fault in robkit. It prints a line saying it's a bug and where to report it, then the fault with its stack and cause, and exits 1.

## Whose fault is it

A file or program the person owns, or can install, fails as a `CommandProblem` that names it:

- A malformed file the person owns, such as `robkit.json` or an install's own `robkit/templates/<stack>` override, names the file and says how to fix it.
- A command that fails names itself, the folder it ran in and its exit code, and says its output is above: "pnpm install --no-frozen-lockfile exited with 1 in /home/me/robkit. Its output is above: fix what it says, then try again." `exec` from `@robkit/dev/cli` does this. A command whose output robkit reads, such as `pnpm pack --json`, puts what it printed in the message instead.
- A command that can't start, such as git or pnpm missing, says what to check and keeps the spawn error as `cause`.

A malformed file robkit ships, such as one of its own templates, is a fault: the person can't fix it, so it prints as a bug.

## One way to report

`Report` in `@robkit/session` is the one shape for saying what went wrong when nobody calling can handle it:

```ts
type Report = (message: string, cause?: unknown) => void;
```

The message says what robkit was doing; the cause is the error underneath. Core's `logError`, the guard's default `onUnavailable` and `runCommand` all report through it, and `reportToConsole`, their default, prints the message and then the cause on its own. A new place that logs a fault takes a `Report`, defaulting to `reportToConsole`. An install's `packages/core-client` runs in the browser, so it has its own `Report` and `reportToConsole` of the same shape.

## Cleaning up

Code that starts several things, such as the dev runner with its apps, proxy and Postgres, stops every one of them even when stopping one fails. Run each step, collect what failed, then throw: one failure as it is, so a `CommandProblem` still prints alone, or several in an `AggregateError` that keeps each.

Only the error that means "already gone" counts as gone. A signal to a process group that fails with `ESRCH` means the group has exited; any other code, such as `EPERM`, is rethrown with its cause.

## What a `catch` may do

A `catch` does one of three things:

1. Translate the error into a value or an answer, such as a 400 for a body that isn't JSON, or a `CommandProblem` for a command that couldn't start.
2. Recover, with a comment or a log line saying why that's safe.
3. Rethrow, with the caught error as `cause`.

A `catch` that drops its error needs a comment saying why. Lint enforces these rules. ESLint's `preserve-caught-error` fails a `throw` inside a `catch` without `cause`. `robkit/no-silent-catch` fails a `catch` block or `.catch()` handler that never reads its error and has no comment inside it or on the line above its statement. Outside tests, `robkit/no-bare-error` fails a thrown `Error` whose message is fixed text and that has no `cause`, and `robkit/one-problem-type` fails `throw new Error(x.error)`: a problem the person can fix is a `CommandProblem`, ends a server with `orExit`, or goes through `orThrow`. An install lints with the same rules: see [input.md](input.md#what-lint-enforces).

## Outbound requests time out

Every request robkit sends has a deadline. Pass `AbortSignal.timeout(ms)` as its `signal`, and read the body under it too: a body that stalls after the headers arrive is then cut off by the same signal, and fails the same way as no answer. When a longer wait bounds several requests, such as a Coolify deploy waiting for its build, combine the two with `AbortSignal.any`, so the outer deadline also cuts off a request in flight. The current limits:

| Request                                                                                      | Limit                      |
| -------------------------------------------------------------------------------------------- | -------------------------- |
| The guard fetching an app's access rule from core, headers and body, in dev as in production | 5 seconds                  |
| The guard fetching core's keys                                                               | 5 seconds (jose's default) |
| One request to Coolify                                                                       | 30 seconds                 |
| One app's Coolify deploy, from queueing to its end                                           | 20 minutes                 |
| The hub's and admin's `callCore`, headers and body                                           | 10 seconds                 |

## Messages say what to do

A message a person reads names what failed and what to check. "Couldn't read Coolify's servers: no answer in 30 seconds. Check COOLIFY_URL and that Coolify is up." is the shape. "GET /servers failed" isn't.
