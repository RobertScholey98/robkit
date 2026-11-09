# @robkit/next

The Next.js adapter. `guarded` is the proxy Next runs before every page, route handler and server action, from `src/proxy.ts`. It runs robkit's guard, then passes the viewer on to the app in a request header, which `viewer()` reads in server components, route handlers and server actions.

Apps on the Next.js stack use it. It needs Next 16, whose proxy runs on Node: the guard checks tokens with `node:crypto` and asks core over `node:http`, so it can't run on the Edge runtime.

## Example

From the Next.js template (`templates/stacks/next/src/proxy.ts`):

```ts
import { orExit, readGuardEnv } from "@robkit/input";
import { guarded } from "@robkit/next";

// The app's slug and core's address, which pnpm dev and robkit deploy set.
// The rule is the one the owner set for this app in admin.
export const proxy = guarded(orExit(readGuardEnv(process.env)));

// Every path but Next's own files. Next reads this where it is written, so
// it stays a literal here.
export const config = { matcher: ["/((?!_next/).*)"] };
```

Then a server component, route handler or server action asks who is asking:

```ts
import { viewer } from "@robkit/next";

export async function GET(): Promise<Response> {
  const asking = await viewer();
  return Response.json({ kind: asking.kind });
}
```

`pnpm dev` and the production image set `ROBKIT_APP` and `ROBKIT_CORE_URL` for every app.

## Exports

| Export             | What it is                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `guarded(options)` | The proxy. Lets the request through with the viewer passed on, or answers it (redirect, 401, 404) |
| `viewer()`         | Who is asking, as the proxy passed it on. Throws when the proxy didn't guard the request          |
| `GuardedOptions`   | `app` (the slug), `core` (core's public origin), and an optional fixed `access` rule              |
| `Viewer`           | The owner, a guest with role ids, or `{ kind: "nobody" }`                                         |

## A lapsed session

A page load that finds the session lapsed follows the guard's redirect to the hub or core and back. A call from the page gets the guard's 401 instead, since a fetch can't follow it. Next makes two kinds of call:

- **A client navigation** fetches the next page's RSC payload. Next's client loads the page in full when that fetch gets an answer that isn't RSC, so the 401 becomes a page load, which the guard redirects. The adapter adds nothing.
- **A server action** posts to the page. Next's client fails the action on an answer that isn't RSC, unless it carries `x-action-redirect`, which makes it load that address in full. So the adapter adds `x-action-redirect` to the guard's 401 for a server action: the 401's address with `next` set to the page, as `sessionFetch` from `@robkit/react` does. The 401 is otherwise unchanged.

Next hands the proxy a URL on its own host and port. The adapter keeps only its path and query, and puts them on the app's own origin, from `ROBKIT_CORE_URL`, as the guard does. So the page a server action comes back to is on the app's origin, whatever `Host` or `X-Forwarded-Proto` the proxy in front sent.

A route handler the page calls with `fetch` gets the 401 as it is. Call it with `sessionFetch` from `@robkit/react`.

## The viewer header

The proxy passes the viewer on in the `robkit-viewer` request header. It replaces any the request came with, so on a path the matcher covers, nobody can send their own. On a path the matcher leaves out, the proxy doesn't run, so it can't replace one. The proxy puts a key beside each viewer, random for each server process, and `viewer()` refuses a header without it. So a request the proxy didn't guard makes `viewer()` throw, whatever headers it came with.

The proxy and the app's code are bundled apart but run in one Node process, under `next dev` and in production, so the key is kept on `globalThis`.

## What it must never do

- Run on the Edge runtime. Next 16's proxy runs on Node, and the adapter imports `node:crypto`.
- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Next's shape. Its tests run `@robkit/guard`'s conformance cases.
- Read the request's body. Next hands it to the app.
