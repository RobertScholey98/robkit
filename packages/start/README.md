# @robkit/start

The TanStack Start adapter. `guarded` wraps your app's server entry, so robkit's guard runs on every request Start handles, page loads and server function calls alike, and routes and server functions get the viewer as `context.viewer`.

Apps on the TanStack Start stack use it.

## Example

From the Start template (`templates/stacks/start/src/server.ts`):

```ts
import { guarded, type GuardedContext } from "@robkit/start";
import entry from "@tanstack/react-start/server-entry";

// Routes and server functions read the guard's viewer as context.viewer.
declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: GuardedContext };
  }
}

// The rule is the one the owner set for this app in admin.
export default guarded(entry);
```

`guarded(entry)` reads `ROBKIT_APP` and `ROBKIT_CORE_URL`, which `pnpm dev` and the production image set for every app. When one is missing or won't do, the app prints the problem and exits 1.

The `declare module` block stays in the app's `src/server.ts`. Start's types read it only from there: the same block in this package's types, or in any other file of the app, doesn't reach a server function's `context`.

Pair it with `sessionFetch` from `@robkit/react` in `src/start.ts`, so a server function called after the app's token lapsed sends the browser for a new one instead of failing.

## Exports

| Export                     | What it is                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guarded(entry, options?)` | Start's server entry with the guard in front. It adds `X-Frame-Options: SAMEORIGIN`, `nosniff` and, over https, HSTS to every answer it lets through, where Start set none                    |
| `GuardedOptions`           | All optional: `app` (the slug) and `core` (core's public origin), read from `ROBKIT_APP` and `ROBKIT_CORE_URL` when left out and taken as plain strings when given, and a fixed `access` rule |
| `coreOrigin()`             | Core's public origin, from `ROBKIT_CORE_URL`, for a page that calls core. It exits with the reader's message when the variable is unset or won't do, as `guarded()` does                      |
| `GuardedContext`           | `{ viewer }`, to register as Start's request context                                                                                                                                          |
| `Viewer`                   | The owner, a guest with role ids, or `{ kind: "nobody" }`                                                                                                                                     |

## What it must never do

- Go in `src/start.ts`. Start loads that file in the browser too, and the guard is server code. Wrap the server entry instead.
- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Start's shape. Its tests run `@robkit/guard`'s conformance cases.
