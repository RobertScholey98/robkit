# My robkit install

This is a robkit install: your own small apps for friends and family, behind one sign-in. People sign in with an access code you give them, and you decide which roles may open which app.

`pnpm dev` runs it on this machine. Open http://hub.robkit.localhost:3000 and claim the install to become its owner.

## Commands

```sh
pnpm dev                    # Postgres in Docker, then core, the hub, admin and every app
pnpm robkit add             # add an app, with pnpm dev running or not; asks for its stack, name, who can open it and an icon
pnpm robkit migrate <slug>  # apply an app's new migration while pnpm dev runs
pnpm robkit upgrade         # move to the newest robkit; see "Upgrade robkit" below
pnpm lint                   # the install's layer rule, ESLint, then each app's own lint
pnpm typecheck
pnpm test
pnpm build
pnpm format                 # format every file with Prettier
```

## Where things are

- `apps/<slug>` is an app, on `<slug>.robkit.localhost:3000` under `pnpm dev`. Its folder name is its slug, its subdomain and its database schema. Each app has an `AGENTS.md` that describes its stack.
- `apps/hub` is where people sign in and open apps. `apps/admin` is where you make access codes and roles and say who may open each app.
- `apps/core` runs core, which holds the owner, the codes, the roles and the sessions.
- `packages/` holds what the apps share: the UI kit in `packages/ui`, the look in `packages/theme` and the client the hub and admin call core with.

## Start the database again from nothing

`pnpm dev` keeps Postgres's data in a Docker volume, so the owner, codes and each app's data last from one run to the next. To start again with an empty database, stop `pnpm dev`, then run this in the install's folder:

```sh
docker compose down --volumes
pnpm dev
```

You claim the install again on the hub.

## Upgrade robkit

Commit your changes and stop `pnpm dev`, then run one of these in the install's folder:

```sh
pnpm robkit upgrade         # to the newest robkit
pnpm robkit upgrade 0.2.0   # to the version given
```

It moves robkit's packages in `pnpm-workspace.yaml` to the new version and installs them. Then the new robkit replaces its lint policy in `tooling/eslint` and, if you have a Go app, its Go module in `vendor/robkit/go`. It adds or raises the catalog entries it needs, and raises `packageManager` in `package.json`. It changes nothing else, and ends by printing what it changed and robkit's changelog between the two versions. Read `git diff`, run `pnpm lint`, `pnpm typecheck` and `pnpm test`, then commit.

An upgrade doesn't reach the files robkit copied into the install for you to own: your apps, the hub, admin, `packages/`, the `Dockerfile`, `compose.yaml`, `turbo.json` and `.github`. When a new robkit changes one of those, the changelog it prints says what to change by hand.

If `pnpm install` fails, or you stop it with Ctrl+C, `robkit upgrade` puts back every file it changed. Run `pnpm install` to put `node_modules` back too. If an upgrade was stopped any other way, such as a closed terminal, put its files back yourself:

```sh
git restore --source=HEAD --staged --worktree -- .
git clean -fd -- tooling/eslint vendor/robkit/go
pnpm install
```

## Read more

- `AGENTS.md`: the settings `pnpm dev` reads, the layer rule, databases and production.
- `docs/deploy.md`: putting the install on a server with Coolify.
- robkit's own docs: https://github.com/RobertScholey98/robkit
