# @robkit/express

The Express adapter. `guarded` is Express middleware that runs robkit's guard on every request and hands your handlers the viewer as `res.locals.viewer`.

Apps on the React with Express stack use it. It needs Express 5.

## Example

From the React with Express template (`templates/stacks/express/src/server.tsx`):

```ts
import { guarded, type GuardedResponse } from "@robkit/express";
import { orExit, readGuardEnv } from "@robkit/input";
import express from "express";

const app = express();

// The app's slug and core's address, which pnpm dev and robkit deploy set.
const guard = orExit(readGuardEnv(process.env));

// The rule is the one the owner set for this app in admin.
app.use(guarded(guard));

app.get("/", (_req, res: GuardedResponse) => {
  const { viewer } = res.locals;
  res.send(viewer.kind === "nobody" ? "Not signed in" : viewer.id);
});
```

`pnpm dev` and the production image set `ROBKIT_APP` and `ROBKIT_CORE_URL` for every app.

The guard reads the path and query on the request line, and the headers, never the body, so a body parser such as `express.json()` can sit after it. It puts the path on the app's own origin, from `ROBKIT_CORE_URL`, and never reads `Host`. A request line such as `//evil.com/x` stays a path on the app, and a request with no `Host` is guarded like any other.

## Exports

| Export             | What it is                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guarded(options)` | Express middleware. Lets the request through with `res.locals.viewer` set, and `X-Frame-Options: SAMEORIGIN`, `nosniff` and, over https, HSTS set on the response before the handlers run, or answers it (redirect, 401, 403, 404) |
| `GuardedOptions`   | `app` (the slug), `core` (core's public origin), and an optional fixed `access` rule                                                                                                                                               |
| `GuardedLocals`    | What `guarded` puts on `res.locals`: `{ viewer }`                                                                                                                                                                                  |
| `GuardedResponse`  | The response a handler behind `guarded` gets, which types `res.locals.viewer`                                                                                                                                                      |
| `Viewer`           | The owner, a guest with role ids, or `{ kind: "nobody" }`                                                                                                                                                                          |

## What it must never do

- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Express's shape. Its tests run `@robkit/guard`'s conformance cases.
- Read the request's body. The app's own handlers read it.
