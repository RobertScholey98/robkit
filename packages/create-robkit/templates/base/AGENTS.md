# This install

This is a robkit install: a monorepo of small apps behind one sign-in. Core holds the owner, guests' access codes, roles and which apps each role may open. The hub is where people sign in and launch apps, and admin is where the owner manages codes, roles and apps. Every other folder under `apps/` is an app, on its own subdomain, with its own Postgres schema.

## Commands

```sh
pnpm dev                     # Postgres, core, the hub, admin and every app, on *.robkit.localhost:3000
pnpm robkit add              # add an app; asks for its stack, name, who can open it and an icon
pnpm lint                    # robkit check, then the linter if the install has one
pnpm typecheck
pnpm test
pnpm build
```

## Layout

- `apps/<slug>` is an app. Its folder name is its slug, its subdomain (`<slug>.robkit.localhost` locally) and its Postgres role and schema. A slug is lowercase letters and digits, starting with a letter. Each app has its own `AGENTS.md` for its stack.
- `apps/core` runs `@robkit/core`, the backend. `apps/hub` and `apps/admin` are the platform's own apps.
- `packages/` holds code the apps share, such as `packages/core-client`, which the hub and admin call core through.
- `robkit.json` records the choices this install was made with. `robkit add` reads it.
- An app's `package.json` may declare a `robkit` field: who may open it when core first sees it, and the emoji the launcher shows. After that, the owner sets who may open it in admin.

## The layer rule

`robkit check` enforces each rule here, and `pnpm lint` runs it. Its message names the rule a file breaks.

- An app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.
- An app reaches core over HTTP only, never through @robkit/core. Only `apps/core` imports it. Postgres keeps the data side: an app's role can reach its own schema and nothing else.
- Handlers take the viewer from their adapter. App code never reads the session cookie or verifies a token itself.

## Databases

`pnpm dev` and the provision step before a deploy give each app with a `migrate` script its own schema and role, then run that script. The app gets its connection as `DATABASE_URL`, with its own schema first on the search path. Write migrations so they can run again: the script runs every time.
