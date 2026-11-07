# @robkit/session

Session tokens and the request guard. It reads and verifies the tokens core signs, and runs the guard on a web-standard `Request`.

The adapters (`@robkit/hono`, `@robkit/express`, `@robkit/start`) wrap `requestGuard`. Core uses the token readers, and `@robkit/react` uses `@robkit/session/lapsed`. An app's own code doesn't import it: it takes the viewer from its adapter.

## Example

An adapter runs `requestGuard` on every request (`packages/hono/src/guarded.ts`):

```ts
import { requestGuard } from "@robkit/session";
import { orExit, readGuardEnv } from "@robkit/input";

// The app's slug and core's address, which pnpm dev and robkit deploy set.
const check = requestGuard(orExit(readGuardEnv(process.env)));

async function handle(request: Request): Promise<Response> {
  const decision = await check(request);
  // A redirect to the hub or core, the guard's 401 for a call, or a 404.
  if (decision.outcome === "answer") return decision.response;
  return new Response(`Hello, ${decision.viewer.kind}`);
}
```

## Exports

`@robkit/session`:

| Export                                                                                | What it is                                                                                                                                                 |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestGuard(options)`                                                               | A function from `Request` to `{ outcome: "serve", viewer }` or `{ outcome: "answer", response }`. Answers `/_robkit/session` and `/_robkit/refresh` itself |
| `GuardedOptions`                                                                      | `app` (the slug), `core` (core's public origin), an optional fixed `access` rule, as admin uses, and an optional `onUnavailable`                           |
| `GuardFault`, `AccessRuleFailure`                                                     | What `onUnavailable` hears when the guard answers 503: what failed, the cause, and for the access rule how core's answer failed                            |
| `RequestDecision`                                                                     | `requestGuard`'s answer                                                                                                                                    |
| `readSessionToken`, `readAppToken`                                                    | Verify core's token or an app token, and read its claims                                                                                                   |
| `sessionTokensIn(cookieHeader)`                                                       | The session tokens in a `Cookie` header                                                                                                                    |
| `sessionCookie`, `coreAudience`, `sessionTokenLifetimeSeconds`                        | The cookie's name, core's audience, and a token's lifetime (15 minutes)                                                                                    |
| `appSessionPath`, `appRefreshPath`, `appSessionUrl`                                   | The guard's two paths, and the callback URL core sends the browser to                                                                                      |
| `SessionTokenClaims`, `ViewerClaims`, `ReadSessionToken`, `ReadAppToken`, `VerifyKey` | Their types                                                                                                                                                |

The readers for input from outside robkit's own code, an app's environment, the manifest format, an install's addresses and `Report` are in `@robkit/input`.

`@robkit/session/lapsed` imports nothing. It holds the guard's 401 for a call whose token lapsed: `sessionLapsedResponse`, which the guard writes, and `readSessionLapsed`, which `sessionFetch` reads.

## What it must never do

- Import a framework. `tooling/eslint` enforces it.
- Put a cookie on the parent domain. Each token sits in a host-only cookie on its own host.
- Accept a token for another audience. An app's guard accepts only a token minted for its own slug.
- Take core's address from the request. It comes from config, so a request can't choose whose keys the app trusts.

## For contributors

- A slug is lowercase letters and digits, starting with a letter. `readSlug` in `@robkit/input` holds the rule, returns an `InputProblem` for anything else, and is the only maker of the `Slug` brand, which every function that puts a slug into a token, SQL or an address takes.
- No cookie goes on the parent domain.
- Core's own token has the audience `core` and sits in a host-only cookie on core's host, and core reads no other.
- Each app, admin included, holds its own app token, with its slug as the audience and no session id, in a host-only cookie on its own host. `requestGuard` takes the slug as `app` and accepts no other token.
- A page load it holds nothing for goes to core's `/refresh` with a random state, and core sends the browser back to the app's `/_robkit/session` with a token for that app, or none if nobody is signed in.
- The guard answers that callback, and `/_robkit/refresh`, where a call whose token lapsed sends the browser, itself, so the adapters and the app's code never see them.
- It fetches core's public key once, so apps verify tokens locally, and keeps an app's access rule from core for a minute.
- When it can't check a request it answers 503 and tells `onUnavailable` why: what failed (`core-key`, `access-rule` or `network`) and the cause. An `access-rule` fault also has a `reason`: `unknown-app`, `bad-answer`, `invalid-json` or `interrupted-body`. By default that reports the app, what failed and the cause through `reportToConsole` from `@robkit/input/report`.
- The guard's code is in four files. `request-guard.ts` is the dispatcher: it reads the session, reads the rule, asks `guard` and turns the decision into an answer. `refresh-protocol.ts` holds the trip through core and back, with the state cookie and the app's own cookie, and reads the session from that cookie. `core-access.ts` loads the app's rule, keeps it for a minute, and throws an `AccessRuleError` that says how core's answer failed. `guard-http.ts` holds the helpers for reading the request and writing the answer.
- `@robkit/session/lapsed` is the guard's 401 for a call whose session has lapsed, which `sessionFetch` reads. It imports nothing, so the browser can load it.
