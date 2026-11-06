# @robkit/hono

The Hono adapter. `guarded` is Hono middleware that runs robkit's guard on every request and hands your handlers the viewer as `c.var.viewer`.

Apps on the React with Hono stack use it, and so does admin.

## Example

From the React with Hono template (`templates/stacks/react-hono/src/server.tsx`):

```ts
import { guarded, type GuardedEnv } from "@robkit/hono";
import { isProblem } from "@robkit/session/input";
import { readGuardEnv } from "@robkit/session/app-env";
import { Hono } from "hono";

const app = new Hono<GuardedEnv>();

// The app's slug and core's address, which pnpm dev and robkit deploy set.
const guard = readGuardEnv(process.env);
if (isProblem(guard)) throw new Error(guard.error);

// The rule is the one the owner set for this app in admin.
app.use(guarded(guard));

app.get("/", (c) => {
  const { viewer } = c.var;
  return c.text(viewer.kind === "nobody" ? "Not signed in" : viewer.id);
});
```

Admin fixes its rule instead of asking core (`templates/base/apps/admin/src/server.ts`):

```ts
import { guarded } from "@robkit/hono";
import { isProblem, readCoreUrl } from "@robkit/session/input";
import { Hono } from "hono";

const core = readCoreUrl(process.env);
if (isProblem(core)) throw new Error(core.error);

const app = new Hono();

// Only the owner may open admin, whatever core's catalog says.
app.use(guarded({ app: "admin", access: { kind: "owner" }, core }));
```

`pnpm dev` and the production image set `ROBKIT_APP` and `ROBKIT_CORE_URL` for every app.

## Exports

| Export             | What it is                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| `guarded(options)` | Hono middleware. Lets the request through with `c.var.viewer` set, or answers it (redirect, 401, 404) |
| `GuardedOptions`   | `app` (the slug), `core` (core's public origin), and an optional fixed `access` rule                  |
| `GuardedEnv`       | The Hono env that types `c.var.viewer`                                                                |
| `Viewer`           | The owner, a guest with role ids, or `{ kind: "nobody" }`                                             |

## What it must never do

- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Hono's shape. Its tests run `@robkit/guard`'s conformance cases.
