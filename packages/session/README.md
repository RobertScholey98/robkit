# @robkit/session

Session tokens, the request guard, and an install's addresses. It reads and verifies the tokens core signs, runs the guard on a web-standard `Request`, and turns an install's domain into each app's address.

The adapters (`@robkit/hono`, `@robkit/start`) wrap `requestGuard`. Core uses the token readers and the addresses. The hub, admin, the dev runner and init use `@robkit/session/addresses`, and `@robkit/react` uses `@robkit/session/lapsed`. An app's own code doesn't import it: it takes the viewer from its adapter.

## Example

An adapter runs `requestGuard` on every request (`packages/hono/src/guarded.ts`):

```ts
import { requestGuard } from "@robkit/session";

const check = requestGuard({
  app: "notes",
  core: "http://core.robkit.localhost:3000",
});

async function handle(request: Request): Promise<Response> {
  const decision = await check(request);
  // A redirect to the hub or core, the guard's 401 for a call, or a 404.
  if ("response" in decision) return decision.response;
  return new Response(`Hello, ${decision.viewer.kind}`);
}
```

The hub finds core from its own address (`templates/base/apps/hub/src/core-origin.ts`):

```ts
import { installAt } from "@robkit/session/addresses";

installAt("http://hub.robkit.localhost:3000/", "hub")?.origin("core");
// "http://core.robkit.localhost:3000"
```

## Exports

`@robkit/session`:

| Export                                                                                | What it is                                                                                                            |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `requestGuard(options)`                                                               | A function from `Request` to `{ viewer }` or `{ response }`. Answers `/_robkit/session` and `/_robkit/refresh` itself |
| `GuardedOptions`                                                                      | `app` (the slug), `core` (core's public origin), and an optional fixed `access` rule, as admin uses                   |
| `RequestDecision`                                                                     | `requestGuard`'s answer                                                                                               |
| `readSessionToken`, `readAppToken`                                                    | Verify core's token or an app token, and read its claims                                                              |
| `sessionTokensIn(cookieHeader)`                                                       | The session tokens in a `Cookie` header                                                                               |
| `sessionCookie`, `coreAudience`, `sessionTokenLifetimeSeconds`                        | The cookie's name, core's audience, and a token's lifetime (15 minutes)                                               |
| `appSessionPath`, `appRefreshPath`, `appSessionUrl`                                   | The guard's two paths, and the callback URL core sends the browser to                                                 |
| `SessionTokenClaims`, `ViewerClaims`, `ReadSessionToken`, `ReadAppToken`, `VerifyKey` | Their types                                                                                                           |

`@robkit/session/addresses` imports nothing, so the browser can load it:

| Export                                | What it is                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `install({ domain, protocol, port })` | An install's addresses: each app's `host` and `origin`, `onInstall(url)`, `appOf(url)` |
| `installAt(url, app)`                 | The install `url` is on, given that it is `app`'s address                              |
| `platformApps`, `isPlatformApp`       | Core, the hub and admin                                                                |
| `isLocal(domain)`                     | Whether the domain is `localhost` or under it                                          |
| `defaultDomain`, `defaultDevPort`     | `robkit.localhost` and `3000`                                                          |

`@robkit/session/lapsed` imports nothing either. It holds the guard's 401 for a call whose token lapsed: `sessionLapsedResponse`, which the guard writes, and `readSessionLapsed`, which `sessionFetch` reads.

## What it must never do

- Import a framework. `tooling/eslint` enforces it.
- Put a cookie on the parent domain. Each token sits in a host-only cookie on its own host.
- Accept a token for another audience. An app's guard accepts only a token minted for its own slug.
- Take core's address from the request. It comes from config, so a request can't choose whose keys the app trusts.
