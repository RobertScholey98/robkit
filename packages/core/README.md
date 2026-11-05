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
  readDeclaredApps,
  readTrustedProxy,
  registerApps,
} from "@robkit/core";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const db = createDatabase(env("DATABASE_URL"));
await ensureSigningKey(db);
// The owner's apps, as each declares itself.
await registerApps(db, readDeclaredApps(process.env.ROBKIT_APPS));
const app = createApp({
  db,
  domain: env("ROBKIT_DOMAIN"),
  trustedProxy: readTrustedProxy(process.env.ROBKIT_TRUSTED_PROXY),
});

// Core trusts the proxy's X-Forwarded-For, so only the proxy may reach it.
// A container sets HOST to listen beyond loopback.
const hostname = process.env.HOST ?? "127.0.0.1";
serve({ fetch: app.fetch, hostname, port: Number(env("PORT")) });
```

And its `apps/core/src/migrate.ts`, which runs before core starts:

```ts
import { migrate } from "@robkit/core";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

await migrate(databaseUrl);
```

## Exports

| Export                                    | What it is                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| `createApp(options)`                      | Core's Hono app. `CoreOptions`: `db`, `domain`, optional `trustedProxy` and `now`           |
| `createDatabase(url)`, `Database`         | A Drizzle database on core's schema                                                         |
| `migrate(url)`                            | Applies core's migrations from `drizzle/`                                                   |
| `ensureSigningKey(db)`, `SigningKey`      | Core's Ed25519 key, made on first boot and kept in core's schema                            |
| `readDeclaredApps(text)`, `DeclaredApp`   | Reads `ROBKIT_APPS`: each app's slug and what its manifest declares                         |
| `registerApps(db, apps)`                  | Adds apps core hasn't seen, with their declared rule or owner-only. Keeps the owner's edits |
| `readTrustedProxy(value)`, `TrustedProxy` | Reads `ROBKIT_TRUSTED_PROXY`: `cloudflare` or nothing                                       |

Core's routes are in `src/app.ts`. `docs/architecture.md` shows how they fit the request and token flows.

## What it must never do

- Keep a table outside the `core` schema. Declare each with `core.table()` in `src/schema.ts`. `tooling/eslint` enforces it.
- Be reached by anything but the proxy. It trusts `X-Forwarded-For`, or `CF-Connecting-IP` with `ROBKIT_TRUSTED_PROXY=cloudflare`, for its sign-in limit.
- Read any cookie but its own. It renews only from core's token, never from an app token.
- Be imported by an app. `robkit check` enforces that in an install.
