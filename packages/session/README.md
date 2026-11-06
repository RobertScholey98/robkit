# @robkit/session

Session tokens, the request guard, and an install's addresses. It reads and verifies the tokens core signs, runs the guard on a web-standard `Request`, and turns an install's domain into each app's address.

The adapters (`@robkit/hono`, `@robkit/start`) wrap `requestGuard`. Core uses the token readers and the addresses. The hub, admin, the dev runner and init use `@robkit/session/addresses`, and `@robkit/react` uses `@robkit/session/lapsed`. An app's own code doesn't import it: it takes the viewer from its adapter.

## Example

An adapter runs `requestGuard` on every request (`packages/hono/src/guarded.ts`):

```ts
import { requestGuard } from "@robkit/session";
import { isProblem, readGuardEnv } from "@robkit/session/input";

// The app's slug and core's address, which pnpm dev and robkit deploy set.
const options = readGuardEnv(process.env);
if (isProblem(options)) throw new Error(options.error);

const check = requestGuard(options);

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

| Export                                                                                | What it is                                                                                                                         |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `requestGuard(options)`                                                               | A function from `Request` to `{ viewer }` or `{ response }`. Answers `/_robkit/session` and `/_robkit/refresh` itself              |
| `GuardedOptions`                                                                      | `app` (the slug), `core` (core's public origin), and an optional fixed `access` rule, as admin uses                                |
| `RequestDecision`                                                                     | `requestGuard`'s answer                                                                                                            |
| `readSessionToken`, `readAppToken`                                                    | Verify core's token or an app token, and read its claims                                                                           |
| `sessionTokensIn(cookieHeader)`                                                       | The session tokens in a `Cookie` header                                                                                            |
| `sessionCookie`, `coreAudience`, `sessionTokenLifetimeSeconds`                        | The cookie's name, core's audience, and a token's lifetime (15 minutes)                                                            |
| `appSessionPath`, `appRefreshPath`, `appSessionUrl`                                   | The guard's two paths, and the callback URL core sends the browser to                                                              |
| `SessionTokenClaims`, `ViewerClaims`, `ReadSessionToken`, `ReadAppToken`, `VerifyKey` | Their types                                                                                                                        |
| `Report`, `reportToConsole`                                                           | The one shape for reporting a fault, `(message, cause?)`, and its default, which prints the message, then the cause with its stack |

`@robkit/session/addresses` imports nothing, so the browser can load it:

| Export                                         | What it is                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `install({ domain, protocol, port })`          | An install's addresses: each app's `host` and `origin`, which take a `Slug`, `onInstall(url)`, `appOf(url)`                                |
| `installAt(url, app)`                          | The install `url` is on, given that it is `app`'s address                                                                                  |
| `platformApps`, `isPlatformApp`                | Core, the hub and admin                                                                                                                    |
| `isLocal(domain)`                              | Whether the domain is `localhost` or under it                                                                                              |
| `defaultDomain`, `defaultDevPort`              | `robkit.localhost` and `3000`                                                                                                              |
| `readSlug(value)`, `Slug`, `slugProblem(name)` | A slug: lowercase letters and digits, starting with a letter. `readSlug` returns a `Slug` or an `InputProblem`, and only it makes a `Slug` |

`@robkit/session/input` holds the readers every package and app use for input from outside robkit's own code (see `docs/conventions/input.md`). Each returns the value or an `InputProblem` naming the variable or file, the key and the fix: `readPort`, `readHost`, `readDomain`, `readCoreUrl`, `readAppSlug`, `readDatabaseUrl`, `readSet`, `readServeEnv`, `readDevServerEnv`, `readGuardEnv` and `parseJson`, with `isProblem`, `allProblems` and `isRecord`.

`@robkit/session/manifest` holds the manifest format: what an app declares in its `package.json`'s `robkit` field (`AppDeclaration`, read by `readAppDeclaration` and written by `appDeclarationJson`), and each app as `ROBKIT_APPS` hands it to core (`DeclaredApp`, read by `readDeclaredApp`). A declared access rule names its roles (`DeclaredAccess`), where the guard's takes role ids.

`@robkit/session/lapsed` imports nothing either. It holds the guard's 401 for a call whose token lapsed: `sessionLapsedResponse`, which the guard writes, and `readSessionLapsed`, which `sessionFetch` reads.

## What it must never do

- Import a framework. `tooling/eslint` enforces it.
- Put a cookie on the parent domain. Each token sits in a host-only cookie on its own host.
- Accept a token for another audience. An app's guard accepts only a token minted for its own slug.
- Take core's address from the request. It comes from config, so a request can't choose whose keys the app trusts.

## For contributors

- A slug is lowercase letters and digits, starting with a letter. `readSlug` in `@robkit/session/addresses` holds the rule, returns an `InputProblem` for anything else, and is the only maker of the `Slug` brand, which every function that puts a slug into a token, SQL or an address takes.
- No cookie goes on the parent domain.
- Core's own token has the audience `core` and sits in a host-only cookie on core's host, and core reads no other.
- Each app, admin included, holds its own app token, with its slug as the audience and no session id, in a host-only cookie on its own host. `requestGuard` takes the slug as `app` and accepts no other token.
- A page load it holds nothing for goes to core's `/refresh` with a random state, and core sends the browser back to the app's `/_robkit/session` with a token for that app, or none if nobody is signed in.
- The guard answers that callback, and `/_robkit/refresh`, where a call whose token lapsed sends the browser, itself, so the adapters and the app's code never see them.
- It fetches core's public key once, so apps verify tokens locally, and keeps an app's access rule from core for a minute.
- When it can't check a request it answers 503 and tells `onUnavailable` why: what failed (`core-key`, `access-rule` or `network`) and the cause. By default that reports the app, what failed and the cause through `reportToConsole`.
- `Report` is the one shape for reporting a fault nobody calling can handle. Core's `logError`, the guard's default `onUnavailable` and dev's `runCommand` all report through it (see `docs/conventions/errors.md`).
- `@robkit/session/lapsed` is the guard's 401 for a call whose session has lapsed, which `sessionFetch` reads. It imports nothing, so the browser can load it.
- `@robkit/session/input` holds the readers for input from outside robkit's own code: environment variables and JSON. Each returns the value or an `InputProblem`.
- `@robkit/session/manifest` reads and writes what an app declares in its `robkit` field. The dev runner reads it from each app, core reads it from `ROBKIT_APPS`, and `robkit add` writes it.
- `@robkit/session/addresses` turns an install's domain into its addresses: each app on `<slug>.<domain>`, the platform apps' names, the default domain and dev port, and whether a URL is on the install. Core, the guard, the hub, admin, the dev runner, init and the whole-stack test all take their addresses from it. It imports nothing either.
