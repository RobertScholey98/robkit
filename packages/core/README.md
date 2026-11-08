# @robkit/core

Core: the Hono backend that owns the core tables (the owner, access codes, sessions, roles and the app catalog) and the signing key. It handles claiming the install, signing in and out, `/refresh`, and everything admin manages.

Only an install's `apps/core` imports it. Every other app, the hub and admin included, reaches core over HTTP.

## Example

An install's `apps/core/src/main.ts`:

```ts
import { serve } from "@hono/node-server";
import {
  createApp,
  createDatabase,
  ensureSigningKey,
  readCoreConfig,
  registerApps,
} from "@robkit/core";
import { isProblem } from "@robkit/input";

const config = readCoreConfig(process.env);
if (isProblem(config)) {
  console.error(config.error);
  process.exit(1);
}

const db = createDatabase(config.databaseUrl);
await ensureSigningKey(db);
// The owner's apps, as each declares itself. Core adds any it doesn't know,
// with the rule it declares or as owner-only.
await registerApps(db, config.apps);
const app = createApp({
  db,
  domain: config.domain,
  // Set to cloudflare behind a Cloudflare tunnel, so the sign-in limits
  // count each visitor. Only when nothing but the tunnel reaches the host.
  trustedProxy: config.trustedProxy,
});

// Core trusts the proxy's X-Forwarded-For, so only the proxy may reach it.
// A container sets HOST to listen beyond loopback.
const { host: hostname, port } = config;

serve({ fetch: app.fetch, hostname, port }, ({ port }) => {
  console.log(`core listening on ${hostname}:${String(port)}`);
});
```

And its `apps/core/src/migrate.ts`, which runs before core starts:

```ts
import { migrate } from "@robkit/core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

await migrate(databaseUrl);
```

## Exports

| Export                               | What it is                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createApp(options)`                 | Core's Hono app. `CoreOptions`: `db`, `domain` (a `Domain`, as `readCoreConfig` reads it), optional `trustedProxy`, `now` and `logError`, a `Report` where every unexpected error is logged |
| `createDatabase(url)`, `Database`    | Core's connection to its schema, to hand to `createApp`, `ensureSigningKey` and `registerApps`                                                                                              |
| `migrate(url)`                       | Applies core's migrations from `drizzle/`                                                                                                                                                   |
| `ensureSigningKey(db)`, `SigningKey` | Core's Ed25519 key, made on first boot and kept in core's schema                                                                                                                            |
| `readCoreConfig(env)`, `CoreConfig`  | Reads core's environment once, at start: its database, domain, apps (`ROBKIT_APPS`), trusted proxy, host and port, or an `InputProblem` naming each bad variable                            |
| `registerApps(db, apps)`             | Adds apps core hasn't seen, with their declared rule or owner-only. Keeps the owner's edits                                                                                                 |
| `TrustedProxy`                       | `cloudflare`, or nothing                                                                                                                                                                    |

Core's routes are in `src/routes/`, one Hono app each for status, the session, codes, apps and roles. `createApp` in `src/app.ts` mounts them behind CORS and the rules every POST meets, and its one error handler answers what a route didn't expect. `docs/architecture.md` shows how they fit the request and token flows.

## What it must never do

- Keep a table outside the `core` schema. Declare each with `core.table()` in `src/schema.ts`. `tooling/eslint` enforces it.
- Be reached by anything but the proxy. It trusts `X-Forwarded-For`, or `CF-Connecting-IP` with `ROBKIT_TRUSTED_PROXY=cloudflare`, for its sign-in limit.
- Read any cookie but its own. It renews only from core's token, never from an app token.
- Be imported by an app. `robkit check` enforces that in an install.

## For contributors

- `createApp` takes `logError`, a `Report` from `@robkit/input/report` that defaults to `reportToConsole`. Every unexpected error (one handler, `app.onError`, answering a generic 500) and an unreachable database are reported there.
- `session-claims.ts` holds the session logic that needs no database: when a session expires, the holder's claims and guard viewer, and when a live session's token renews. `session-store.ts` calls it, and its unit tests need no Postgres.
- Each 500 carries a fresh request id, in the `X-Request-Id` header and the body's `requestId`. The log line names the same id, such as `GET /path failed (request <id>).`, so a 500 a person reports leads to its cause in core's log.
- Core adds a new app with the rule it declares, or owner-only, and creates any role it names that the owner lacks. After that admin sets who may open it, and core keeps the owner's rule.
