# @robkit/next

The Next.js adapter. `guarded` is the proxy Next runs before every page, route handler and server action, from `src/proxy.ts`. It runs robkit's guard, then passes the viewer on to the app in a request header, which `viewer()` reads in server components, route handlers and server actions.

Apps on the Next.js stack use it. It needs Next 16, whose proxy runs on Node: the guard checks tokens with `node:crypto` and asks core over `node:http`, so it can't run on the Edge runtime.

## Example

From the Next.js template (`templates/stacks/next/src/proxy.ts`):

```ts
import { guarded } from "@robkit/next";

// The rule is the one the owner set for this app in admin.
export const proxy = guarded();

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

`guarded()` reads `ROBKIT_APP` and `ROBKIT_CORE_URL`, which `pnpm dev` and the production image set for every app. When one is missing or won't do, the app prints the problem and exits 1.

## Exports

| Export                 | What it is                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `guarded(options?)`    | The proxy. Lets the request through with the viewer passed on, or answers it (redirect, 401, 403, 404)                                                                                        |
| `viewer()`             | Who is asking, as the proxy passed it on. Throws when the proxy didn't guard the request                                                                                                      |
| `GuardedOptions`       | All optional: `app` (the slug) and `core` (core's public origin), read from `ROBKIT_APP` and `ROBKIT_CORE_URL` when left out and taken as plain strings when given, and a fixed `access` rule |
| `coreOrigin()`         | Core's public origin, from `ROBKIT_CORE_URL`, for a page that calls core. It exits with the reader's message when the variable is unset or won't do, as `guarded()` does                      |
| `Viewer`               | The owner, a guest with role ids, or `{ kind: "nobody" }`                                                                                                                                     |
| `@robkit/next/testing` | For tests only: `owner()`, `guest({ roles })` and `nobody()`. See [Testing](#testing)                                                                                                         |
| `@robkit/next/config`  | `withRobkit(config?)`, for `next.config.ts`. See [The config](#the-config)                                                                                                                    |

## A lapsed session

A page load that finds the session lapsed follows the guard's redirect to the hub or core and back. A call from the page gets the guard's 401 instead, since a fetch can't follow it. Next makes two kinds of call:

- **A client navigation** fetches the next page's RSC payload. Next's client loads the page in full when that fetch gets an answer that isn't RSC, so the 401 becomes a page load, which the guard redirects. The adapter adds nothing.
- **A server action** posts to the page. Next's client fails the action on an answer that isn't RSC, unless it carries `x-action-redirect`, which makes it load that address in full. So the adapter adds `x-action-redirect` to the guard's 401 for a server action: the 401's address with `next` set to the page, as `sessionFetch` from `@robkit/react` does. The 401 is otherwise unchanged.

Next hands the proxy a URL on its own host and port. The adapter keeps only its path and query, and puts them on the app's own origin, from `ROBKIT_CORE_URL`, as the guard does. So the page a server action comes back to is on the app's origin, whatever `Host` or `X-Forwarded-Proto` the proxy in front sent.

A route handler the page calls with `fetch` gets the 401 as it is. Call it with `sessionFetch` from `@robkit/react`.

## Who may frame a page

The proxy sets `X-Frame-Options: SAMEORIGIN`, `nosniff` and, on an https install, HSTS on what it passes on. Next sends them with the page's or route handler's answer, and drops that answer's own header of the same name, so an app's own `X-Frame-Options` never arrives. To let another origin frame the app, send `Content-Security-Policy: frame-ancestors` instead, which a browser obeys over `X-Frame-Options`: a page through `headers()` in `next.config.ts`, and a route handler on its own answer.

## The viewer header

The proxy passes the viewer on in the `robkit-viewer` request header. It replaces any the request came with, so on a path the matcher covers, nobody can send their own. On a path the matcher leaves out, the proxy doesn't run, so it can't replace one. The proxy puts a key beside each viewer, random for each server process, and `viewer()` refuses a header without it. So a request the proxy didn't guard makes `viewer()` throw, whatever headers it came with.

The proxy and the app's code are bundled apart but run in one Node process, under `next dev` and in production, so the key is kept on `globalThis`.

## Testing

`@robkit/next/testing` is for tests only. It builds viewers with `owner()`, `guest({ roles })` and `nobody()`, so a test never casts to a branded id. It has no stand-in for the guard: `viewer()` reads the request's headers, which Next sets only while it serves a request. So a page reads the viewer once and hands it to a plain function, and a test calls that function with a built viewer:

```ts
import type { Viewer } from "@robkit/next";
import { guest, owner } from "@robkit/next/testing";

// The page calls greeting(await viewer()).
function greeting(asking: Viewer): string {
  return asking.kind === "owner" ? "Welcome back" : "Hello";
}

greeting(owner()); // "Welcome back"
greeting(guest({ roles: ["family"] })); // "Hello"
```

## The config

`@robkit/next/config` exports `withRobkit(config?)`, which an app's `next.config.ts` is one call of:

```ts
import { withRobkit } from "@robkit/next/config";

export default withRobkit({
  // The app's own settings, if any.
  reactStrictMode: true,
});
```

It returns the function Next calls with its phase, and gives the app's settings with what the app needs in an install:

- the build in `dist`, where turbo and the install's Dockerfile find it;
- `agentRules` off, since the app's `AGENTS.md` is the install's and `next dev` would add its own section;
- under `next dev`, the dev proxy's host names in `allowedDevOrigins`, beside any the app gives;
- under `next dev` and `next build`, a linked install's robkit checkout as an extra Turbopack root, beside any the app gives. An install from npm needs none.

Under `next dev` it checks `ROBKIT_APP` and `ROBKIT_CORE_URL`, and stops with the reader's message, naming the one that's missing. Next loads `proxy.ts`, and the guard, only on the first request, so without it a missing setting would wait for that.

It sets `NEXT_TELEMETRY_DISABLED`, which `next build` reads after it loads the config. `next dev`'s own process reads it before it loads any config, so `pnpm dev` sets it for every app. Next's production server sends no telemetry.

Next loads `next.config.ts` in production as well, so an app lists `@robkit/next` under `dependencies`, and `@robkit/next/config` imports nothing from the guard or from a build tool.

| Export                | What it is                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `withRobkit(config?)` | The function Next calls with its phase. `distDir` and `agentRules` are robkit's; the app's other settings stay as given |

## What it must never do

- Run on the Edge runtime. Next 16's proxy runs on Node, and the adapter imports `node:crypto`.
- Import `@robkit/core`, or reach core other than over HTTP. `tooling/eslint` enforces it.
- Decide who may open the app. `requestGuard` and the guard decide; this adapter only turns the answer into Next's shape. Its tests run `@robkit/guard`'s conformance cases.
- Read the request's body. Next hands it to the app.
