# @robkit/react

The client helper. `sessionFetch` is a `fetch` for calls from the page to its own app. When the guard says the app's token has lapsed, it sends the browser for a new one, or to the hub to sign in, and back to the same page. Every other answer goes to the caller untouched.

Apps on the TanStack Start stack use it for their server functions. Any app whose page calls its own server can use it.

## Example

From the Start template (`templates/stacks/start/src/start.ts`):

```ts
import { sessionFetch } from "@robkit/react";
import { createStart } from "@tanstack/react-start";

// A server function called once the session has lapsed sends the browser
// through core's refresh and back, rather than failing.
export const startInstance = createStart(() => ({
  serverFns: { fetch: sessionFetch },
}));
```

Or call it directly:

```ts
import { sessionFetch } from "@robkit/react";

const response = await sessionFetch("/api/notes");
```

A call that finds the token lapsed never settles, because the page is leaving. Don't show an error for it.

## Exports

| Export         | What it is                                                                                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionFetch` | `typeof fetch`. Acts only on the guard's 401 (marked with the `Robkit-Session` header); returns every other answer. Gives up after 30 seconds with a `TimeoutError`; a signal the caller passes still stops it sooner |

## What it must never do

- Import `@robkit/core`, or anything that can't run in the browser. It imports only `@robkit/session/lapsed`, which imports nothing.
- Act on an app's own 401. Only the guard's 401, with its header, sends the browser away.
