# @robkit/serve

What every robkit server does the same way, written once: read `HOST` and `PORT`, listen, answer the client's built files, and stop on SIGTERM. Each Node adapter's `/serve` entry is built on it, and core serves through it.

It depends on `@robkit/input` and `serve-static`, and on nothing from the guard, Vite or any stack.

## Example

An app's own server, with its client's files under `/assets`:

```ts
import { serve } from "@robkit/serve";

serve(
  (request, response) => {
    response.end(`Hello from ${String(request.url)}`);
  },
  { files: [{ at: "/assets", folder: "dist/assets" }], name: "hello" },
);
```

It listens on `HOST` and `PORT`, 127.0.0.1 and 3000 unless set, and prints `hello listening on 127.0.0.1:3000`. A malformed one stops it with the reader's message and exit code 1.

## What every server does

- **Files.** It answers a GET or HEAD for a file in each of `files`, in order, before the app, with its `Content-Type`, an `ETag` and `Last-Modified`. A request for an unchanged file answers 304. A path that climbs out of the folder, encoded or not, a dotfile and a folder get no file, and go on to the app. A relative folder is found from the folder the server runs in, which the container sets. Files go out before the guard, so anything in these folders is public.
- **`nosniff`.** Every answer carries `X-Content-Type-Options: nosniff`, from `@robkit/input/headers`, so a browser takes a stylesheet or script only with the right type.
- **Faults.** A handler that throws or rejects gets a 500, and the server prints `<name> couldn't answer <method> <path>.` with the error.
- **The stop.** On SIGTERM or SIGINT it stops taking new connections, lets the requests already open finish, and closes each connection with its last answer. It runs `onStopped`, prints `<name> stopped` and exits 0. Docker sends SIGTERM to stop a container, and kills it 10 seconds later.
- **The stop's limit.** Some connections close only when the client lets go: one that has sent nothing yet, one whose answer began before the signal, or an upgraded one such as a WebSocket. So the stop waits 8 seconds at most. Then it closes every connection still open, prints `<name> closed 1 connection still open after 8 seconds`, and stops as usual. `<name> stopped` is always its last line.

Core reads its own settings, and resolves with its exit code rather than exiting, so it calls `listenUntilStopped` with a Node handler. Core is a Hono app, so it hands over `getRequestListener(app.fetch)`:

```ts
import { getRequestListener } from "@hono/node-server";
import { listenUntilStopped } from "@robkit/serve";
import { Hono } from "hono";

const app = new Hono();
app.get("/status", (c) => c.text("ok"));

process.exit(
  await listenUntilStopped(getRequestListener(app.fetch), {
    hostname: "127.0.0.1",
    port: 3000,
    name: "core",
    onStopped: () => Promise.resolve(),
  }),
);
```

## Exports

| Export                             | What it is                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `serve(app, options?)`             | Serves `app`, a Node request handler, behind `files`, until SIGTERM, then exits 0. Returns the Node server                                       |
| `ServeOptions`                     | `files`, `address` (`{ host, port }`, read from `HOST` and `PORT` when left out), and `ServerOptions`                                            |
| `ServerOptions`                    | `name`, `server` unless set, for the lines it prints, and `onStopped`, run once it has stopped, such as closing a database. The adapters take it |
| `Files`                            | `{ at, folder }`: the path the files are answered under, such as `/assets`, and their folder                                                     |
| `listenUntilStopped(app, options)` | Serves `app` on `hostname` and `port` until SIGTERM or SIGINT, and resolves with 0 rather than exiting                                           |
| `ListenOptions`                    | `hostname`, `port`, `name` and `onStopped`                                                                                                       |
| `RequestHandler`                   | `(request, response) => unknown`: an Express app, or a fetch handler made into one                                                               |

## Serving files

It uses [serve-static](https://github.com/expressjs/serve-static), Express's own, and nothing written by hand. It is maintained by the Express team, sends the content type, `ETag` and `Last-Modified`, answers conditional requests with 304, and refuses a path that climbs out of its folder. An Express app's image already holds it.

## What it must never do

- Import from the guard, Vite or any stack. The hub's image holds this package, and none of those.
- Write a header's value. They come from `@robkit/input/headers`.
