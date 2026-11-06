# @robkit/start

The TanStack Start adapter. `guarded` wraps your app's server entry, so robkit's guard runs on every request Start handles, page loads and server function calls alike, and routes and server functions get the viewer as `context.viewer`.

Apps on the TanStack Start stack use it.

## Example

From the Start template (`templates/stacks/start/src/server.ts`):

```ts
import { isProblem } from "@robkit/session/input";
import { readGuardEnv } from "@robkit/session/app-env";
import { guarded, type GuardedContext } from "@robkit/start";
import entry from "@tanstack/react-start/server-entry";

// Routes and server functions read the guard's viewer as context.viewer.
declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: GuardedContext };
  }
}

// The app's slug and core's address, which pnpm dev and robkit deploy set.
const guard = readGuardEnv(process.env);
if (isProblem(guard)) throw new Error(guard.error);

// The rule is the one the owner set for this app in admin.
export default guarded(entry, guard);
```

Pair it with `sessionFetch` from `@robkit/react` in `src/start.ts`, so a server function called after the app's token lapsed sends the browser for a new one instead of failing.

## Exports

| Export                    | What it is                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `guarded(entry, options)` | Start's server entry with the guard in front                                         |
| `GuardedOptions`          | `app` (the slug), `core` (core's public origin), and an optional fixed `access` rule |
| `GuardedContext`          | `{ viewer }`, to register as Start's request context                                 |
| `Viewer`                  | The owner, a guest with role ids, or `{ kind: "nobody" }`                            |

## What it must never do

- Go in `src/start.ts`. Start loads that file in the browser too, and the guard is server code. Wrap the server entry instead.
- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Start's shape. Its tests run `@robkit/guard`'s conformance cases.
