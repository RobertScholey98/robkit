# @robkit/hono

The Hono adapter. `guarded` is Hono middleware that runs robkit's guard on every request and hands your handlers the viewer as `c.var.viewer`.

Apps on the React with Hono stack use it, and so does admin.

## Example

From the React with Hono template (`templates/stacks/react-hono/src/server.tsx`):

```ts
import { guarded, type GuardedEnv } from "@robkit/hono";
import { Hono } from "hono";

const app = new Hono<GuardedEnv>();

// The rule is the one the owner set for this app in admin.
app.use(guarded());

app.get("/", (c) => {
  const { viewer } = c.var;
  return c.text(viewer.kind === "nobody" ? "Not signed in" : viewer.id);
});
```

Admin fixes its rule instead of asking core, and puts core's origin in its page (`templates/base/apps/admin/src/server.ts`):

```ts
import { coreOrigin, guarded } from "@robkit/hono";
import { Hono } from "hono";

const core = coreOrigin();

const app = new Hono();

// Only the owner may open admin, whatever core's catalog says.
app.use(guarded({ access: { kind: "owner" } }));
app.get("*", (c) => c.html(`<meta name="robkit-core" content="${core}" />`));
```

`guarded()` reads `ROBKIT_APP` and `ROBKIT_CORE_URL`, which `pnpm dev` and the production image set for every app. When one is missing or won't do, the app prints the problem and exits 1.

## Exports

| Export                 | What it is                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `guarded(options?)`    | Hono middleware. Lets the request through with `c.var.viewer` set, and adds `X-Frame-Options: SAMEORIGIN`, `nosniff` and, over https, HSTS to its answer where the app set none, or answers it (redirect, 401, 403, 404) |
| `GuardedOptions`       | All optional: `app` (the slug) and `core` (core's public origin), read from `ROBKIT_APP` and `ROBKIT_CORE_URL` when left out and taken as plain strings when given, and a fixed `access` rule                            |
| `coreOrigin()`         | Core's public origin, from `ROBKIT_CORE_URL`, for a page that calls core. It exits with the reader's message when the variable is unset or won't do, as `guarded()` does                                                 |
| `GuardedEnv`           | The Hono env that types `c.var.viewer`                                                                                                                                                                                   |
| `Viewer`               | The owner, a guest with role ids, or `{ kind: "nobody" }`                                                                                                                                                                |
| `@robkit/hono/serve`   | `serve(app, options?)`, which serves the app in production. See [Serving](#serving)                                                                                                                                      |
| `@robkit/hono/testing` | For tests only: `owner()`, `guest({ roles })` and `nobody()`, and `guardedAs(viewer)`, a stand-in for `guarded()`. See [Testing](#testing)                                                                               |

## Serving

`@robkit/hono/serve` serves the app in production. An app's `src/serve.ts` is the import, the app and one call:

```ts
import { serve } from "@robkit/hono/serve";
import { Hono } from "hono";

const app = new Hono();
app.get("/", (c) => c.text("hello"));

serve(app);
```

It listens on `HOST` and `PORT`, 127.0.0.1 and 3000 unless set, and refuses a malformed one with the reader's message. It answers the client's built files in `dist/assets` under `/assets`, then the files in the app's own `public` folder at the root, then the app. Nothing else in `dist`, such as the server's own `dist/serve.js`, is ever answered. Both folders are found from the folder the app runs in, which the container sets. Every answer carries `nosniff`. On SIGTERM it stops as `@robkit/serve` does and exits 0. It returns the Node server, so a WebSocket server can attach to it and a test can close it.

`ServeOptions`: `assets` and `public` move the folders, and `name` and `onStopped` are `@robkit/serve`'s. Admin's client build is in `dist/client`, so it calls `serve(admin, { assets: "dist/client/assets", name: "admin" })`, and Vite's manifest beside it is never answered.

Its files go out before the guard, so they are public.

## Testing

`@robkit/hono/testing` is for tests only. It builds viewers with `owner()`, `guest({ roles })` and `nobody()`, so a test never casts to a branded id, and gives `guardedAs(viewer)`, a stand-in for `guarded()` that checks nothing and serves every request as that viewer. A test puts it where the server puts `guarded()`, in front of the app's routes, and needs no core and no settings:

```ts
import type { GuardedEnv } from "@robkit/hono";
import { guardedAs, guest } from "@robkit/hono/testing";
import { Hono } from "hono";

const app = new Hono<GuardedEnv>();
app.use(guardedAs(guest({ roles: ["family"] })));
app.get("/", (c) => c.text(c.var.viewer.kind));

const res = await app.request("/");
// 200, "guest"
```

When `NODE_ENV` is `production`, as in every image robkit builds, `guardedAs` answers every request with a 500 that names it, so test code copied into a server opens nothing. `guarded()` itself has no option, setting or environment variable that skips the check.

## What it must never do

- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Hono's shape. Its tests run `@robkit/guard`'s conformance cases.
