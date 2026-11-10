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

| Export                    | What it is                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guarded(options?)`       | Express middleware. Lets the request through with `res.locals.viewer` set, and `X-Frame-Options: SAMEORIGIN`, `nosniff` and, over https, HSTS set on the response before the handlers run, or answers it (redirect, 401, 403, 404) |
| `GuardedOptions`          | All optional: `app` (the slug) and `core` (core's public origin), read from `ROBKIT_APP` and `ROBKIT_CORE_URL` when left out and taken as plain strings when given, and a fixed `access` rule                                      |
| `coreOrigin()`            | Core's public origin, from `ROBKIT_CORE_URL`, for a page that calls core. It exits with the reader's message when the variable is unset or won't do, as `guarded()` does                                                           |
| `GuardedLocals`           | What `guarded` puts on `res.locals`: `{ viewer }`                                                                                                                                                                                  |
| `GuardedResponse`         | The response a handler behind `guarded` gets, which types `res.locals.viewer`                                                                                                                                                      |
| `Viewer`                  | The owner, a guest with role ids, or `{ kind: "nobody" }`                                                                                                                                                                          |
| `@robkit/express/serve`   | `serve(app, options?)`, which serves the app in production. See [Serving](#serving)                                                                                                                                                |
| `@robkit/express/testing` | For tests only: `owner()`, `guest({ roles })` and `nobody()`, and `guardedAs(viewer)`, a stand-in for `guarded()`. See [Testing](#testing)                                                                                         |

## Serving

`@robkit/express/serve` serves the app in production. An app's `src/serve.ts` is the import, the app and one call:

```ts
import { serve } from "@robkit/express/serve";
import express from "express";

const app = express();
app.get("/", (_req, res) => {
  res.send("hello");
});

serve(app);
```

It listens on `HOST` and `PORT`, 127.0.0.1 and 3000 unless set, and refuses a malformed one with the reader's message. It answers the client's built files in `dist/assets` under `/assets`, then the files in the app's own `public` folder at the root, then the app. Nothing else in `dist`, such as the server's own `dist/serve.js`, is ever answered. Both folders are found from the folder the app runs in, which the container sets. Every answer carries `nosniff`. On SIGTERM it stops as `@robkit/serve` does and exits 0. It returns the Node server, so a WebSocket server can attach to it and a test can close it.

`ServeOptions`: `assets` and `public` move the folders, and `name` and `onStopped` are `@robkit/serve`'s. Its files go out before the guard, so they are public.

## Testing

`@robkit/express/testing` is for tests only. It builds viewers with `owner()`, `guest({ roles })` and `nobody()`, so a test never casts to a branded id, and gives `guardedAs(viewer)`, a stand-in for `guarded()` that checks nothing and serves every request as that viewer. A test puts it where the server puts `guarded()`, in front of the app's routes, and needs no core and no settings:

```ts
import type { GuardedResponse } from "@robkit/express";
import { guardedAs, owner } from "@robkit/express/testing";
import express from "express";

const app = express();
app.use(guardedAs(owner()));
app.get("/", (_req, res: GuardedResponse) => {
  res.send(res.locals.viewer.kind);
});
app.listen(0, "127.0.0.1"); // then send it requests; every one is the owner's
```

`guardedAs` serves only in a test run: when `NODE_ENV` is `test`, or under Vitest when `NODE_ENV` isn't `production`. Anywhere else it answers every request with a 500 that names it: in an image, under `pnpm dev`, and in a server started by hand. So test code copied into a server opens nothing. Another test runner needs `NODE_ENV=test`. `guarded()` itself has no option, setting or environment variable that skips the check.

## What it must never do

- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Express's shape. Its tests run `@robkit/guard`'s conformance cases.
- Read the request's body. The app's own handlers read it.
