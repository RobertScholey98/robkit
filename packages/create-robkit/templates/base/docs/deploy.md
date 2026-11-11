# Deploy to Coolify

Every app under `apps/` runs in its own container on Coolify, built from the install's one `Dockerfile`. `pnpm robkit deploy` creates and configures each app's Coolify application from this repository, and the CI workflow runs it on every push to `main` once the checks pass. It needs Coolify 4.3 or later.

## TLS in front of Coolify

`robkit deploy` needs something in front of Coolify that terminates TLS, and is written for one arrangement: a Cloudflare tunnel, which takes https from visitors and carries plain http to Coolify's Traefik. So it gives each application an `http://` domain with force-HTTPS off.

Without a TLS terminator in front, visitors reach the apps over plain http. Core's sign-in cookie is only sent over https, so nobody can sign in, and every app's address in `ROBKIT_CORE_URL` and the catalog points at an https address nothing answers.

Coolify's own certificates aren't supported yet. Traefik issues them only for an `https://` domain, and `robkit deploy` writes `http://` ones.

## What a deploy does

1. Reads `coolify.json` for the Coolify project, environment, server, GitHub App, repository, branch and domain.
2. Finds each app's Coolify application by name (`<project>-<slug>`), so one made by hand is adopted, not duplicated. It creates the ones Coolify lacks.
3. Sets each application's domain (`http://<slug>.<domain>`), port 3000, the `/Dockerfile` build with `ROBKIT_APP` as its build argument, auto-deploy off and force-HTTPS off, then sets its variables. Variables the install doesn't name are left alone.
4. Deploys core first, then the apps that need it, together. No app deploys in a run where core's settings couldn't be saved or its deploy failed, and the output names the apps it held back.

It runs only from a commit pushed to the branch. Coolify builds the branch as GitHub holds it, not your checkout, so from a commit not pushed it would record a build that never happened. Before it reaches Coolify, `robkit deploy`, and `--dry-run` too, checks that the checkout's commit is on the branch at a remote, and says to push it if not. A branch at the remote that is ahead of the checkout is fine. CI's checkout of a push to `main` passes.

Before it writes anything, it checks that the environment has each shared variable the apps refer to: `ROBKIT_ADMIN_DATABASE_URL`, `ROBKIT_DB_SECRET` and each `<SLUG>_DATABASE_URL`. It reads their names only. If one is missing it names it, deploys nothing, and changes nothing on Coolify.

## Which apps deploy

Once an app's deploy finishes, `robkit deploy` records it in the application's description on Coolify: the commit it ran from and a hash of the variables it set. Coolify doesn't build or run with the description, so the record changes nothing in the app. Leave the description alone: `robkit deploy` replaces whatever it holds.

An app deploys when:

- it is new to Coolify
- it has no record, or one `robkit deploy` can't read
- its code, or a package it uses, changed since its recorded commit
- the variables it is about to get differ from its record. A new app, or one that gains or loses a `migrate` script, changes core's variables, so core deploys too
- its recorded commit is no longer in the branch's history, as after a force push

A deploy that fails, is cancelled or runs out of time leaves the record as it was, so the next deploy tries again. So does a record that couldn't be saved, and `robkit deploy` fails and says so. The first deploy of an install, or the first after an upgrade that brought records in, deploys every app.

Coolify builds what the branch holds when it gets to each app, which can be newer than the commit `robkit deploy` ran from. The run for the newer push then sees the app as changed and deploys it again.

`pnpm robkit deploy --all` deploys every app. `--apps notes,hub` deploys the apps named, each app new to Coolify, and core when its record doesn't show the variables it is about to get.

Each container migrates its app's database as it starts, before it serves. Core's container first runs the provision step, which gives every app with a database its schema and role. If a migration fails, the container exits and Coolify keeps the old one running.

`pnpm robkit deploy --dry-run`, with `COOLIFY_URL` and `COOLIFY_TOKEN` set, reads Coolify, writes nothing to it, and prints what each app would do and why. Without them it prints each app's variables.

## Variables

The deploy sets these on each app:

| Variable          | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| `ROBKIT_APP`      | the app's slug, also a build argument                                     |
| `ROBKIT_DOMAIN`   | the domain in `coolify.json`, for every app but core                      |
| `ROBKIT_CORE_URL` | `https://core.<domain>`. Core takes the install's domain from it          |
| `PORT`            | `3000`                                                                    |
| `DATABASE_URL`    | `{{environment.<SLUG>_DATABASE_URL}}`, for an app with a `migrate` script |

Core also gets `ROBKIT_APPS` (the app catalog), `ROBKIT_DATABASES` (the apps to provision), `ROBKIT_ADMIN_DATABASE_URL` and `ROBKIT_DB_SECRET`. The last two are references to shared variables, so no secret lives in this repository or in CI. Core's server starts without them; only the provision step sees them. When `coolify.json` sets `trustedProxy`, core also gets `ROBKIT_TRUSTED_PROXY` (see [Behind a Cloudflare tunnel](#behind-a-cloudflare-tunnel)).

## An app's own settings

Set an app's own settings, such as an API key, on Coolify. Open the app's application, `<project>-<slug>`, and add each one under Environment Variables. Coolify gives them to the app when it next starts, so redeploy the app from Coolify after a change. `robkit deploy` can't see your own variables, so a change to one doesn't deploy the app.

`robkit deploy` sets only the variables in the table above, and sends Coolify nothing that removes or replaces any other. Don't give one of your own a name from that table, or the next deploy replaces its value.

No image holds an app's `.env`. `.dockerignore` leaves out every `.env` file but `.env.example`, so the settings an app has under `pnpm dev` must be set here too. Vite and Next write a value the browser reads, a `VITE_*` or `NEXT_PUBLIC_*` one, into the page when the image builds, and the build takes no setting but `ROBKIT_APP`. So in production the page doesn't have it. Read the setting on the server and hand it to the page instead.

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
     "domain": "<your domain>",
     "trustedProxy": "cloudflare"
   }
   ```

   Leave out `trustedProxy` unless the host is reachable only through a Cloudflare tunnel. See [Behind a Cloudflare tunnel](#behind-a-cloudflare-tunnel).

8. Point `*.<domain>` at Coolify. With a Cloudflare tunnel, Cloudflare terminates TLS and the tunnel carries plain http to Traefik, which is why the deploy sets `http://` domains with force-HTTPS off.
9. In Coolify, create an API token with `read`, `write` and `deploy`. Add it to the repository's secrets as `COOLIFY_TOKEN`, with `COOLIFY_URL`. If Cloudflare Access guards Coolify, add a service token as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`.
10. Until the `@robkit/*` packages are on npm, an install made with `--link` must carry them: run `pnpm robkit vendor`, then commit `vendor/robkit` and the lockfile.
11. Deploy everything once: `pnpm robkit deploy --all` with the same variables set, or push to `main`.

## Behind a Cloudflare tunnel

Core limits failed sign-ins per visitor: 5 wrong passwords, or 10 wrong codes, in 15 minutes. It also allows 20 wrong codes an hour across the whole install. It needs to know who each visitor is. By default it takes the last `X-Forwarded-For` entry, the address Traefik saw. Behind a tunnel, Traefik sees the tunnel for every visitor, so they all share one limit, and anyone can lock the owner out by failing on purpose.

With `"trustedProxy": "cloudflare"` in `coolify.json`, core names each visitor by Cloudflare's `CF-Connecting-IP` header instead. Cloudflare sets that header itself and replaces any value a visitor sends, and Traefik passes it to core unchanged. A request without it didn't come through Cloudflare, and all such requests share one limit.

Set it only when nothing but the tunnel reaches the host. If Traefik also answers on the server's public address, anyone can go around Cloudflare and send their own `CF-Connecting-IP`. They then get a fresh limit for each address they name, and can lock out a real visitor by naming theirs. Close ports 80 and 443 to the internet, or leave `trustedProxy` out and accept the shared limit.

Two things the setting doesn't cover:

- Apps call core at its public URL, so through Cloudflare too. Cloudflare names the server's own address for them, and they never sign in, so that's harmless.
- Every container on Coolify's network can reach core directly, skipping Traefik and Cloudflare, and could send either header. Only your own apps run there.

After the first deploy, check it: fail to sign in five times from one network, then sign in from another, such as a phone off Wi-Fi. The second should get in.

## First visit

Open `https://hub.<domain>` straight away and claim the install: whoever sets it up first becomes its owner. Then check that:

- the setup screen is gone on the next visit
- a code minted in admin signs a guest in on the hub, and opens an app on its own subdomain
- the `test` code is refused

## Adding an app

`pnpm robkit add` writes the app. If it has a database, run `pnpm robkit database-urls` again and add its new `<SLUG>_DATABASE_URL` shared variable before you push. The next deploy creates its application, redeploys core with it, then starts it.

## Removing an app's application

Deleting an app's folder takes the app out of core's catalog, so the next deploy redeploys core without it. `robkit deploy` never deletes an application. It names the old one as matching no app, and leaves it running.

To remove it, open the application `<project>-<slug>` in Coolify, stop it, and delete it. Its schema and role stay in Postgres, and its `<SLUG>_DATABASE_URL` shared variable stays in the environment, until you delete them yourself.
