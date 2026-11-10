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

| Export              | What it is                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `guarded(options?)` | Hono middleware. Lets the request through with `c.var.viewer` set, and adds `X-Frame-Options: SAMEORIGIN`, `nosniff` and, over https, HSTS to its answer where the app set none, or answers it (redirect, 401, 403, 404) |
| `GuardedOptions`    | All optional: `app` (the slug) and `core` (core's public origin), read from `ROBKIT_APP` and `ROBKIT_CORE_URL` when left out and taken as plain strings when given, and a fixed `access` rule                            |
| `coreOrigin()`      | Core's public origin, from `ROBKIT_CORE_URL`, for a page that calls core. It exits with the reader's message when the variable is unset or won't do, as `guarded()` does                                                 |
| `GuardedEnv`        | The Hono env that types `c.var.viewer`                                                                                                                                                                                   |
| `Viewer`            | The owner, a guest with role ids, or `{ kind: "nobody" }`                                                                                                                                                                |

## What it must never do

- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Hono's shape. Its tests run `@robkit/guard`'s conformance cases.
