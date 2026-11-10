# @robkit/serve

What every robkit server does the same way, written once: listen, and stop on SIGTERM. Core serves through it.

## Example

Core's server, from `packages/core/src/serve-core.ts`:

```ts
import { listenUntilStopped } from "@robkit/serve";
import { Hono } from "hono";

const app = new Hono();
app.get("/status", (c) => c.text("ok"));

process.exit(
  await listenUntilStopped({
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: 3000,
    name: "core",
    onStopped: () => Promise.resolve(),
  }),
);
```

It prints `core listening on 127.0.0.1:3000`. On SIGTERM or SIGINT it stops taking new connections, lets the requests already open finish, closes each connection with its last answer, runs `onStopped`, prints `core stopped` and resolves with 0. Docker sends SIGTERM to stop a container, and kills it 10 seconds later.

## Exports

| Export                        | What it is                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `listenUntilStopped(options)` | Serves `fetch` on `hostname` and `port` until SIGTERM or SIGINT, and resolves with 0         |
| `ListenOptions`               | `fetch`, `hostname`, `port`, `name` for the lines it prints, and `onStopped`, run as it ends |

## What it must never do

- Import from the guard, Vite or any stack. The hub's image holds this package, and none of those.
