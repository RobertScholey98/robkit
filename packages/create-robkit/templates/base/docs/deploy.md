# Deploy to Coolify

Every app under `apps/` runs in its own container on Coolify, built from the install's one `Dockerfile`. `pnpm robkit deploy` creates and configures each app's Coolify application from this repository, and the CI workflow runs it on every push to `main` once the checks pass.

## What a deploy does

1. Reads `coolify.json` for the Coolify project, environment, server, GitHub App, repository, branch and domain.
2. Finds each app's Coolify application by name (`<project>-<slug>`), so one made by hand is adopted, not duplicated. It creates the ones Coolify lacks.
3. Sets each application's domain (`http://<slug>.<domain>`), port 3000, the `/Dockerfile` build with `ROBKIT_APP` as its build argument, auto-deploy off and force-HTTPS off, then sets its variables. Variables the install doesn't name are left alone.
4. Deploys core first, then every app that changed and every app new to Coolify. A new app changes core's catalog, so core deploys with it.

Each container migrates its app's database as it starts, before it serves. Core's container first runs the provision step, which gives every app with a database its schema and role. If a migration fails, the container exits and Coolify keeps the old one running.

`pnpm robkit deploy --dry-run` prints each app's variables without contacting Coolify.

## Variables

The deploy sets these on each app:

| Variable          | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `ROBKIT_APP`      | the app's slug, also a build argument                                     |
| `ROBKIT_DOMAIN`   | the domain in `coolify.json`                                              |
| `ROBKIT_CORE_URL` | `https://core.<domain>`                                                   |
| `PORT`            | `3000`                                                                    |
| `DATABASE_URL`    | `{{environment.<SLUG>_DATABASE_URL}}`, for an app with a `migrate` script |

Core also gets `ROBKIT_APPS` (the app catalog), `ROBKIT_DATABASES` (the apps to provision), `ROBKIT_ADMIN_DATABASE_URL` and `ROBKIT_DB_SECRET`. The last two are references to shared variables, so no secret lives in this repository or in CI. Core's server starts without them; only the provision step sees them.

## One-time setup

1. In Coolify, add a GitHub App under Sources, install it on this repository only, and leave pull request previews off.
2. Create a project and an environment, named as in `coolify.json`.
3. In that environment, add a PostgreSQL resource on `postgres:18-alpine` and start it. Copy its internal URL. Its host only resolves inside Coolify's Docker network.
4. Make the install's database secret: `openssl rand -hex 32`. Keep it somewhere safe; every app's database password comes from it.
5. Print each app's `DATABASE_URL`:

   ```sh
   ROBKIT_ADMIN_DATABASE_URL='<internal Postgres URL>' ROBKIT_DB_SECRET='<secret>' pnpm robkit database-urls
   ```

6. Add the environment's shared variables: `ROBKIT_ADMIN_DATABASE_URL`, `ROBKIT_DB_SECRET`, and each `<SLUG>_DATABASE_URL` line from step 5.
7. Write `coolify.json` at the install's root:

   ```json
   {
     "project": "robkit",
     "environment": "production",
     "server": "localhost",
     "githubApp": "<the GitHub App's name>",
     "repository": "<owner>/<repo>",
     "branch": "main",
     "domain": "<your domain>"
   }
   ```

8. Point `*.<domain>` at Coolify. With a Cloudflare tunnel, Cloudflare terminates TLS and the tunnel carries plain http to Traefik, which is why the deploy sets `http://` domains with force-HTTPS off.
9. In Coolify, create an API token with `read`, `write` and `deploy`. Add it to the repository's secrets as `COOLIFY_TOKEN`, with `COOLIFY_URL`. If Cloudflare Access guards Coolify, add a service token as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
10. Until the `@robkit/*` packages are on npm, an install made with `--link` must carry them: run `pnpm robkit vendor`, then commit `vendor/robkit` and the lockfile.
11. Deploy everything once: `pnpm robkit deploy --all` with the same variables set, or push to `main`.

## First visit

Open `https://hub.<domain>` straight away and claim the install: whoever sets it up first becomes its owner. Then check that:

- the setup screen is gone on the next visit
- a code minted in admin signs a guest in on the hub, and opens an app on its own subdomain
- the `test` code is refused

## Adding an app

`pnpm robkit add` writes the app. If it has a database, run `pnpm robkit database-urls` again and add its new `<SLUG>_DATABASE_URL` shared variable before you push. The next deploy creates its application, redeploys core with it, then starts it.
