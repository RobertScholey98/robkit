# 11: First hosted install

**What to build:** An install generated on the default choices deploys to robkit.dev using R's Coolify method: each app in its own container, provisioning and migrate commands as pre-deploy steps, and `ROBKIT_DOMAIN` set to robkit.dev. The owner claims the install through the first-run setup screen, mints a code, and a guest signs in with it on the hub and opens an app on its subdomain over HTTPS. This comes before the other ORMs, package managers and kits so they build on a Dockerfile, env and migrate setup that has already met production. Time-box it, and move what doesn't fit into follow-up tickets.

**Blocked by:** 10, 23, 28

**Status:** ready-for-human

- [ ] Core, hub, admin and the example app are each live on their robkit.dev subdomain
- [x] The owner claims the fresh install on first visit, and the setup screen is gone afterwards
- [x] An app added with `robkit add` after the first deploy is live after its next deploy
- [x] The `test` code is refused on the hosted install
- [x] How a generated app's Dockerfile, env, provision and migrate steps plug into Coolify is written down for tickets 13, 14 and 18 to follow
- [x] Problems found are fixed in the kit or listed in follow-up tickets

Source: the robkit v0.1 spec, https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5

## Comments

Notes carried over from the finished tickets 02 to 09, which were deleted once done:

- **Env.** Set `ROBKIT_CORE_URL` to core's public https origin, `ROBKIT_APP` on each app, and `ROBKIT_APPS` on core. `ROBKIT_DOMAIN` is required by core. (03, 04, 06)
- **Core's network.** Core listens on 127.0.0.1 unless `HOST` is set, because its sign-in limit trusts `X-Forwarded-For`. The container must set `HOST=0.0.0.0` and keep core's port off the public network. (03)
- **Production servers.** The Start app runs under `vite dev` only, and needs a production server for `dist/server/server.js`. The react-hono example has no production build yet. (04, 07)
- **First boot.** Core needs a migrated database to boot. On an unmigrated one it exits 1 with a raw Drizzle error. A friendlier message is still to do. (03)
- **Published packages.** `@robkit/*` export `.ts` source, which Node won't strip under `node_modules`, and the generator reads the catalog from the checkout it runs from. A deploy that doesn't link a checkout needs built packages and a catalog shipped in `create-robkit`. (02, 08)

Notes from ticket 10:

- **Role passwords (R, 2026-11-03).** In production each app's role password is derived from one install secret, `ROBKIT_DB_SECRET`, held only by the provision step: an HMAC of the slug. robkit prints each app's `DATABASE_URL` so the owner sets it once on the host. The provision step today sets a fresh random password on every run, which is right for local dev only; this ticket adds the derived one.
- **`ROBKIT_APPS` is JSON now.** Core reads a JSON list of `{ slug, access?, icon? }`, each app's manifest from the `robkit` field of its `package.json`. `catalogOf(await discoverApps(root))` in `@robkit/dev` builds it. Core refuses to start on one it can't read.
- **`robkit add` in an install** is `pnpm robkit add`, from `create-robkit` as a dev dependency. An app it adds after the first deploy needs its container, its `DATABASE_URL`, a provision run, and core restarted with the new `ROBKIT_APPS`.

Notes from ticket 12:

- **Builds.** The install's CI runs `pnpm build` (`turbo run build`), but only the hub has a `build` script. Give core, admin and each stack template one as this ticket adds their production servers, and CI builds them for free.

Notes from the build of ticket 11 (2026-11-03):

- **What's left is R's.** Everything a deploy needs is built, and the production e2e proves it on a local host: images built from the install's Dockerfile, Caddy with its own CA in front on `robkit.test`, and the variables `robkit deploy` sets. Ticked criteria are proved there. The first criterion, and each ticked one on robkit.dev itself, waits for R's first live deploy, following the install's `docs/deploy.md`. Nothing was created on Coolify.
- **How a deploy works.** One `Dockerfile` per install, in the package manager's layer, builds any app's image from the `ROBKIT_APP` build argument: `turbo prune`, a frozen install with the install's own pnpm and turbo, `turbo run build`, then `node --run start`. Each app's `start` migrates its database, then serves. Core's `start` runs the provision step first, then migrates, then serves without the admin URL or the secret in its environment. `robkit deploy` (`src/coolify.ts`) creates and configures each Coolify application and deploys core first. `deploymentOf` (`src/deployment.ts`) is the one list of each app's variables, which the deploy and the production e2e both use.
- **Chosen in the build, awaiting R's review:**
  - Migrations and provisioning run as each container starts, not as Coolify pre-deploy commands. I couldn't confirm whether Coolify runs a pre-deploy command in the new container or the one still running the old code, and running at start is right either way. A failed migration exits the new container, and Coolify should keep the old one; check this on the first live deploy.
  - Core's container holds `ROBKIT_ADMIN_DATABASE_URL` and `ROBKIT_DB_SECRET` for the provision step. Core's own process starts without them.
  - Core learns which apps to provision from `ROBKIT_DATABASES`, which `robkit deploy` writes beside `ROBKIT_APPS`. Each app's `DATABASE_URL` is a reference to the shared variable `<SLUG>_DATABASE_URL`, which the owner sets from `robkit database-urls`.
  - Every app shares one Dockerfile, so `robkit deploy` finds each Coolify application by its name, `<project>-<slug>`, not by its Dockerfile path as robnet does.
  - Coolify's own health check is off. The Dockerfile's `HEALTHCHECK` accepts any answer short of a server error, since a guarded app turns a stranger away.
  - The `@robkit/*` packages build to JS and point their packed exports there (`publishConfig`), because Node won't strip types under `node_modules`. Until they're on npm, `robkit vendor` packs them into an install's `vendor/robkit`. Ticket 31 publishes them.
  - Production servers: the hub serves its build with `@hono/node-server`, admin serves its client's build and reads Vite's manifest to name it on the page, the React with Hono stack builds its server with `vite build` as SSR, and the Start stack serves Start's build behind a small Hono server.
- **For tickets 13 and 14.** An ORM's app keeps the contract: a `migrate` script that can run again, and a `start` script that runs it before serving. The production e2e is the check that it works in a container.
- **For ticket 18.** The Dockerfile reads the pnpm and turbo versions from the install and installs them with npm, without Corepack. A package manager's layer brings its own Dockerfile. `COPY vendo[r]` takes `robkit vendor`'s tarballs when they're there.
- **Follow-ups:** 30 (the sign-in limit behind a Cloudflare tunnel), 31 (publishing the packages), 32 (slim images), 33 (the production e2e in CI).
