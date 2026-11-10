# @robkit/vite

Everything robkit adds to Vite. `robkit()` sets an app's dev server up behind `pnpm dev`'s proxy, so an app's `vite.config.ts` holds only the app's own plugins and build settings. Every Vite app in an install uses it: react-hono, Express, Start, Go's page, the hub and admin.

An app lists it under `devDependencies`, since only Vite loads it. It is the one robkit package that names `vite`, as a peer, so no production image holds Vite. A repo check (`vite-stays-out.test.ts` in `tooling/repo-checks`) fails any other published package that names it.

## Example

An app's `vite.config.ts`, with `robkit()` before the app's own plugins:

```ts
import { robkit } from "@robkit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [robkit()],
  build: { outDir: "dist/public" },
});
```

Under `pnpm dev`, `robkit()`:

- listens on 127.0.0.1 at `PORT`, with `strictPort`, so the proxy finds the app where `pnpm dev` said it would be;
- answers the install's host names, `*.<ROBKIT_DOMAIN>`;
- checks `ROBKIT_APP` and `ROBKIT_CORE_URL` as the dev server starts, since Vite loads the app's server, and its guard, only on the first request. A missing one stops the dev server with the reader's message, naming it.

It sends no header: a guarded app's come from its guard. The hub, the one app with no guard, calls `robkit({ guarded: false })`. It skips the check and sends the hub's three headers from the dev server: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'` and `X-Content-Type-Options: nosniff`, from `@robkit/input/headers`.

For `vite build`, and under Vitest, it changes nothing. Vitest loads an app's `vite.config.ts` with no `pnpm dev` behind it, and sets `VITEST` before it does, so an app's tests need no `vitest.config.ts` and no robkit settings.

## Exports

| Export             | What it is                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `robkit(options?)` | The Vite plugin above                                                                        |
| `RobkitOptions`    | `guarded`, `true` unless set. `false` is for the hub: no check, and the hub's headers in dev |

## What it must never do

- Be a dependency of anything an app runs in production. Apps take it under `devDependencies`, and no other robkit package names `vite`.
- Import from the guard, or from what an app runs on, such as Express. An Express app is a function it calls.
