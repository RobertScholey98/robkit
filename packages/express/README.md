# @robkit/express

The Express adapter. `guarded` is Express middleware that runs robkit's guard on every request and hands your handlers the viewer as `res.locals.viewer`.

Apps on the React with Express stack use it. It needs Express 5.

## Example

From the React with Express template (`templates/stacks/express/src/server.tsx`):

```ts
import { guarded, type GuardedResponse } from "@robkit/express";
import express from "express";

const app = express();

// The rule is the one the owner set for this app in admin.
app.use(guarded());

app.get("/", (_req, res: GuardedResponse) => {
  const { viewer } = res.locals;
  res.send(viewer.kind === "nobody" ? "Not signed in" : viewer.id);
});
```

`guarded()` reads `ROBKIT_APP` and `ROBKIT_CORE_URL`, which `pnpm dev` and the production image set for every app. When one is missing or won't do, the app prints the problem and exits 1.

The guard reads the path and query on the request line, and the headers, never the body, so a body parser such as `express.json()` can sit after it. It puts the path on the app's own origin, from `ROBKIT_CORE_URL`, and never reads `Host`. A request line such as `//evil.com/x` stays a path on the app, and a request with no `Host` is guarded like any other.

## Exports

| Export              | What it is                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guarded(options?)` | Express middleware. Lets the request through with `res.locals.viewer` set, and `X-Frame-Options: SAMEORIGIN`, `nosniff` and, over https, HSTS set on the response before the handlers run, or answers it (redirect, 401, 403, 404) |
| `GuardedOptions`    | All optional: `app` (the slug) and `core` (core's public origin), read from `ROBKIT_APP` and `ROBKIT_CORE_URL` when left out and taken as plain strings when given, and a fixed `access` rule                                      |
| `coreOrigin()`      | Core's public origin, from `ROBKIT_CORE_URL`, for a page that calls core. It exits with the reader's message when the variable is unset or won't do, as `guarded()` does                                                           |
| `GuardedLocals`     | What `guarded` puts on `res.locals`: `{ viewer }`                                                                                                                                                                                  |
| `GuardedResponse`   | The response a handler behind `guarded` gets, which types `res.locals.viewer`                                                                                                                                                      |
| `Viewer`            | The owner, a guest with role ids, or `{ kind: "nobody" }`                                                                                                                                                                          |

## What it must never do

- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Express's shape. Its tests run `@robkit/guard`'s conformance cases.
- Read the request's body. The app's own handlers read it.
