# @robkit/session

Session tokens and the request guard. It reads and verifies the tokens core signs, and runs the guard on a web-standard `Request`.

The adapters (`@robkit/hono`, `@robkit/express`, `@robkit/next`, `@robkit/start`) wrap `requestGuard`. Core uses the token readers, and `@robkit/react` uses `@robkit/session/lapsed`. An app's own code doesn't import it: it takes the viewer from its adapter.

## Example

An adapter runs `requestGuard` on every request (`packages/hono/src/guarded.ts`):

```ts
import { requestGuard } from "@robkit/session";
import { orExit, readGuardEnv } from "@robkit/input";

// The app's slug and core's address, which pnpm dev and robkit deploy set.
const check = requestGuard(orExit(readGuardEnv(process.env)));

async function handle(request: Request): Promise<Response> {
  const decision = await check(request);
  // A redirect to the hub or core, the guard's 401 for a call, its 403
  // for a write from another origin, or a 404.
  if (decision.outcome === "answer") return decision.response;
  // X-Frame-Options, nosniff, and HSTS on an https install.
  return new Response(`Hello, ${decision.viewer.kind}`, {
    headers: [...decision.headers],
  });
}
```

## Exports

`@robkit/session`:

| Export                                                                                | What it is                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `requestGuard(options)`                                                               | A function from `Request` to `{ outcome: "serve", viewer, headers }` or `{ outcome: "answer", response }`. Answers `/_robkit/session` and `/_robkit/refresh` itself. An adapter puts `headers` on every answer it serves |
| `securityHeaders(origin, framers)`, `Framers`                                         | The headers robkit sends with an answer from `origin`: `nosniff`, HSTS over https, and who may frame it, `same-origin` or `none`, or no framing header for a redirect                                                    |
| `withHeaders(response, headers)`                                                      | `response` with each of `headers` it lacks, copied first when its headers can't change                                                                                                                                   |
| `isRedirect(status)`                                                                  | Whether `status` sends the browser on, so its answer gets no framing header                                                                                                                                              |
| `appOrigin(options)`                                                                  | The app's public origin, such as `https://notes.robkit.dev`: core's protocol and port on `<app>.<domain>`. The guard builds every URL from it                                                                            |
| `GuardedOptions`                                                                      | `app` (the slug), `core` (core's public origin), an optional fixed `access` rule, as admin uses, and an optional `onUnavailable`                                                                                         |
| `GuardFault`, `AccessRuleFailure`                                                     | What `onUnavailable` hears when the guard answers 503: what failed, the cause, and for the access rule how core's answer failed                                                                                          |
| `RequestDecision`                                                                     | `requestGuard`'s answer                                                                                                                                                                                                  |
| `readSessionToken`, `readAppToken`                                                    | Verify core's token or an app token, and read its claims                                                                                                                                                                 |
| `sessionCookies(origin)`, `SessionCookies`                                            | The session and state cookies' names on the install at `origin`, and how to set them: `__Host-` and `Secure` over https, plain over http, always `Path=/` and no `Domain`                                                |
| `sessionTokensIn(cookieHeader, origin)`                                               | The session tokens a `Cookie` header carries to the install at `origin`, under that install's name alone                                                                                                                 |
| `sessionCookie`, `coreAudience`, `sessionTokenLifetimeSeconds`                        | The session cookie's name before any prefix, core's audience, and a token's lifetime (15 minutes)                                                                                                                        |
| `appSessionPath`, `appRefreshPath`, `appSessionUrl`                                   | The guard's two paths, and the callback URL core sends the browser to                                                                                                                                                    |
| `SessionTokenClaims`, `ViewerClaims`, `ReadSessionToken`, `ReadAppToken`, `VerifyKey` | Their types                                                                                                                                                                                                              |

The readers for input from outside robkit's own code, an app's environment, the manifest format, an install's addresses and `Report` are in `@robkit/input`.

`@robkit/session/lapsed` imports nothing. It holds the guard's 401 for a call whose token lapsed: `sessionLapsedResponse`, which the guard writes, and `readSessionLapsed`, which `sessionFetch` reads.

## What it must never do

- Import a framework. `tooling/eslint` enforces it.
- Put a cookie on the parent domain. Each token sits in a host-only cookie on its own host.
- Accept a token for another audience. An app's guard accepts only a token minted for its own slug.
- Take core's address, or the app's own, from the request. Both come from config, so a request can't choose whose keys the app trusts or where the guard sends the browser. It reads no `Host`, `X-Forwarded-Host` or `X-Forwarded-Proto`.

## For contributors

- A slug is lowercase letters and digits, starting with a letter. `readSlug` in `@robkit/input` holds the rule, returns an `InputProblem` for anything else, and is the only maker of the `Slug` brand, which every function that puts a slug into a token, SQL or an address takes.
- No cookie goes on the parent domain.
- Core's own token has the audience `core` and sits in a host-only cookie on core's host, and core reads no other.
- Each app, admin included, holds its own app token, with its slug as the audience and no session id, in a host-only cookie on its own host. `requestGuard` takes the slug as `app` and accepts no other token.
- Every URL the guard builds is `appOrigin` plus the request's path and query, worked out once from `GuardedOptions`. An adapter may hand it a `Request` on any origin: only its path and query count. The `address` list in `tooling/test-session/request-cases.json` holds the cases, forged headers and a target that starts with two slashes among them, that this package's tests, the Express and Next adapters' tests and Go's tests all run.
- A page load it holds nothing for goes to core's `/refresh` with a random state, and core sends the browser back to the app's `/_robkit/session` with a token for that app, or none if nobody is signed in.
- The guard answers that callback, and `/_robkit/refresh`, where a call whose token lapsed sends the browser, itself, so the adapters and the app's code never see them.
- Before anything else, on every path, it refuses a write from another origin with a plain-text 403 (`isFromAnotherOrigin` in `guard-http.ts`). Any method but GET, HEAD and OPTIONS is a write. `Sec-Fetch-Site` decides when it is there, and `Origin` when it isn't. A WebSocket handshake is judged by `Origin` alone. The `writes` list in `tooling/test-session/request-cases.json` holds the cases, which this package's tests, every adapter's tests and Go's tests run.
- Every answer it lets through carries `X-Frame-Options: SAMEORIGIN` and `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security` when the app's origin is https. The adapter sets them from the decision's `headers`, its own way. The guard's own answers carry them already, except that a redirect gets no framing header, so an app that lets a framer in can renew its token inside the frame. An app changes who may frame it with its own `Content-Security-Policy: frame-ancestors`, which a browser obeys over `X-Frame-Options`. The `headers` list in `tooling/test-session/request-cases.json` holds the cases this package's tests, every adapter's tests and Go's tests run. `answer-headers.ts` holds the headers and HSTS's value.
- A form posted as a page load (`POST` with `Sec-Fetch-Mode: navigate`) that would get the JSON 401 gets an HTML page with the same status instead (`formNotSent` in `guard-http.ts`). Its one link goes through `/_robkit/refresh` back to the page in the `Referer`, when that is a page on the app. Who the guard takes the request to be doesn't change. The `formPost` list holds the `Referer` cases both ports run.
- It fetches core's public key once, so apps verify tokens locally, and keeps an app's access rule from core for a minute.
- When it can't check a request it answers 503 and tells `onUnavailable` why: what failed (`core-key`, `access-rule` or `network`) and the cause. An `access-rule` fault also has a `reason`: `unknown-app`, `bad-answer`, `invalid-json` or `interrupted-body`. By default that reports the app, what failed and the cause through `reportToConsole` from `@robkit/input/report`.
- The guard's code is in five files. `answer-headers.ts` holds the headers every answer carries. `request-guard.ts` is the dispatcher: it reads the session, reads the rule, asks `guard` and turns the decision into an answer. `refresh-protocol.ts` holds the trip through core and back, with the state cookie and the app's own cookie, and reads the session from that cookie. `core-access.ts` loads the app's rule, keeps it for a minute, and throws an `AccessRuleError` that says how core's answer failed. `guard-http.ts` holds the helpers for reading the request and writing the answer.
- `@robkit/session/lapsed` is the guard's 401 for a call whose session has lapsed, which `sessionFetch` reads. It imports nothing, so the browser can load it.
