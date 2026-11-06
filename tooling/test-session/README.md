# @internal/test-session

Test helpers for anything that checks a session: builders for branded values, a signing key shaped like core's, and a fake core on a loopback port. The guard's, session's, adapters' and core's tests use it. It is private and never published.

It needs no Docker, so its own tests run in `pnpm check`.

## Builders

A test builds a branded value the way the code does, through its reader. `robkit/no-brand-cast` fails a cast to one, tests included. Each builder throws the reader's problem if the value isn't valid.

| Builder            | Builds                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `slug(name)`       | A `Slug`, through `readSlug`                                                                                         |
| `aDomain(name?)`   | A `Domain`, `robkit.localhost` unless named, through `readDomain`                                                    |
| `aCodeId(id?)`     | A `CodeId`, `code-1` unless named, through `readCodeId`                                                              |
| `aRoleId(id)`      | A `RoleId`, through `readRoleId`                                                                                     |
| `aViewer(options)` | A `Viewer` as the guard hands one to an app: `{ kind: "owner" }`, `{ kind: "guest", roles }` or `{ kind: "nobody" }` |

## Tokens and cookies

| Export                             | What it is                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signingKey()`                     | A new Ed25519 key pair standing in for core's. `token(options)` signs a session token shaped like core's. `cookieFor(case, slug?)` gives the cookie a conformance case's visitor sends |
| `owner`, `guest(roles?)`, `Holder` | Whose session a token is for                                                                                                                                                           |
| `app`                              | `example`, the app a test guards unless it names another                                                                                                                               |
| `signedOutCookie()`                | The app's cookie saying core said just now that nobody is signed in                                                                                                                    |

`token({ ageSeconds, holder, audience })` signs for the owner and the `example` app, issued now, unless told otherwise. `audience: "core"` gives core's own token, which carries the session's id, and `audience: null` gives one with no audience, as an older robkit issued.

The cookie's name, the token's lifetime and the session callback's path are written out here, not imported from `@robkit/session`, because session's own tests use this package. If session changes one, its guard tests fail.

## The fake core

`fakeCore()` starts core on a loopback port, as an app's guard sees it: it serves its JWKS at `/.well-known/jwks.json` and each app's access rule at `/apps/<slug>/access`. Call it inside a test; it stops when the test finishes.

| Field     | What it is                                                                    |
| --------- | ----------------------------------------------------------------------------- |
| `origin`  | Core's origin, `http://core.robkit.localhost:<port>`, as a `CoreOrigin`       |
| `hub`     | The hub's origin beside it                                                    |
| `key`     | The `SigningKey` core signs with                                              |
| `rules`   | Each app's rule, by slug. Set one before the request; an unknown app gets 404 |
| `status`  | Set to fail every request with that status, such as 503                       |
| `fetched` | Each request core got, as `<host> <path>`                                     |

## The conformance answer

Every adapter must answer each case in `@robkit/guard/conformance` the same way. `conformanceAnswer(case, page, core)` is that answer: a status, a location (`refreshLocation(page, core)` matches a refresh's, whose state is random) and the viewer the app's handlers get. `stateIn(location)` reads a refresh's state, and `callbackFor(next, { state, token })` is where core sends the browser back.

## Example

The Hono adapter's conformance test, cut down. Each case's visitor loads a page, and the adapter must answer as `conformanceAnswer` says:

```ts
import { guarded, type GuardedEnv } from "@robkit/hono";
import { conformanceCases } from "@robkit/guard/conformance";
import { conformanceAnswer, fakeCore, slug } from "@internal/test-session";
import { Hono } from "hono";
import { expect, it } from "vitest";

const page = "http://example.robkit.localhost:3000/notes";

it.each(conformanceCases)("$name", async (asking) => {
  const core = await fakeCore();
  const app = new Hono<GuardedEnv>()
    .use(
      guarded({ app: slug("example"), access: asking.rule, core: core.origin }),
    )
    .get("*", (c) => c.json(c.var.viewer));

  const res = await app.request(page, {
    headers: {
      "sec-fetch-mode": "navigate",
      ...(await core.key.cookieFor(asking)),
    },
  });

  expect({
    status: res.status,
    location: res.headers.get("location"),
    viewer: res.status === 200 ? await res.json() : undefined,
  }).toEqual(conformanceAnswer(asking, page, core));
});
```

`packages/hono/src/guarded.test.ts` holds the whole test.
