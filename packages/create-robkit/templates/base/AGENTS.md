# This install

This is a robkit install: a monorepo of small apps behind one sign-in. Core holds the owner, guests' access codes, roles and which apps each role may open. The hub is where people sign in and launch apps, and admin is where the owner manages codes, roles and apps. Every other folder under `apps/` is an app, on its own subdomain, with its own Postgres schema.

## Commands

```sh
pnpm dev                     # Postgres, core, the hub, admin and every app, on *.robkit.localhost:3000
pnpm robkit add              # add an app; asks for its stack, name, who can open it and an icon
pnpm robkit migrate <slug>   # apply an app's new migration in the running pnpm dev
pnpm robkit upgrade          # move to a newer robkit, with pnpm dev stopped and every change committed
pnpm lint                    # robkit check, ESLint, then each app's own lint
pnpm typecheck
pnpm test
pnpm build
pnpm robkit deploy          # deploy to Coolify; see docs/deploy.md
```

## Settings for pnpm dev

Set them in a `.env` file at the install's root, which git ignores. `pnpm dev` and Docker Compose both read it, and a value exported in the shell wins over the file's.

- `ROBKIT_DEV_PORT`: where the proxy listens, `3000` by default. The apps take the ports after it, one each, so moving it moves them too.
- `ROBKIT_POSTGRES_PORT`: where Postgres listens on this machine, `54320` by default.
- `ROBKIT_DOMAIN`: `robkit.localhost` by default. It must be `localhost` or a name under it.

Before it starts anything, `pnpm dev` checks that Docker answers and that these ports are free, and says which setting to change when one is taken.

## Adding and removing apps

- `pnpm robkit add` works while `pnpm dev` runs. Once the app's files are written and installed, `pnpm dev` gives it a database, migrates it, starts it on a port no running app holds and routes its subdomain, then restarts core so the launcher lists it. Nobody is signed out. `robkit add` prints the app's address, or the problem if it can't start, and every other app keeps running.
- `pnpm robkit migrate <slug>` applies an app's new migration while `pnpm dev` runs, as the app's own role, so its password stays the same. With no `pnpm dev` running, start it: it migrates every app as it starts.
- Removing an app needs a restart. Stop `pnpm dev`, delete `apps/<slug>`, then start `pnpm dev` again.
- `pnpm dev` hears these commands over a socket file in `~/.robkit/run`, which it makes for you alone, so every terminal finds it. It refuses to start if others can open that folder or another account owns it, and the `robkit` commands refuse to use one.

## Upgrading robkit

- `pnpm robkit upgrade` writes only `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packageManager` in `package.json`, `tooling/eslint` and `vendor/robkit/go`. It replaces the last two whole, so don't edit them.
- In the catalog it raises an entry robkit needs higher and adds one it lacks. It never lowers or removes one, so an entry of your own stays.
- It never rewrites an app, the hub, admin, `packages/`, the `Dockerfile`, `compose.yaml`, `turbo.json` or `.github`. When a new robkit changes what those should hold, the changelog it prints says what to change by hand.
- It refuses while `pnpm dev` runs, without a commit, or with a change not committed, so `git diff` afterwards shows only what it did. `README.md` gives the commands that undo an upgrade stopped partway.

## An app's own settings

An app's own settings, such as an API key, go in `apps/<slug>/.env`, which git ignores. Commit an `.env.example` beside it that names each setting without its value.

- `pnpm dev` reads the file as it starts, and gives its settings to that app and its `migrate` script, and to no other app. An edit takes effect at the next `pnpm dev`.
- The runner's own settings win, then a value exported in the shell, then the file's. Every app still gets the shell's whole environment.
- The file can't set `DATABASE_URL`, `PORT`, `HOST`, `NODE_ENV`, `VITEST` or any name that starts `ROBKIT_`. A file that tries stops `pnpm dev`, which names the file and the variable. It may set `NEXT_TELEMETRY_DISABLED`, which `pnpm dev` otherwise sets to `1`.
- `.env` is the only file `pnpm dev` loads. A stack that loads files of its own, as Next does with `.env.local`, still does.
- A test runs with no `pnpm dev` behind it, so nothing loads the file for it. A test that needs a setting sets it.
- In production the owner sets the app's settings on the host, and no image holds an `.env`. `docs/deploy.md` says where.
- Vite and Next write a value the browser reads, a `VITE_*` or `NEXT_PUBLIC_*` one, into the page when they build the app. Docker builds an image without the app's `.env`, so in production the page doesn't have it. Read the setting on the server and hand it to the page instead.

## Layout

- `apps/<slug>` is an app. Its folder name is its slug, its subdomain (`<slug>.robkit.localhost` locally) and its Postgres role and schema. A slug is lowercase letters and digits, starting with a letter. Each app has its own `AGENTS.md` for its stack.
- `apps/core` runs core: its scripts run `robkit-core`, from `@robkit/core`, and it has no source of its own. `apps/hub` and `apps/admin` are the platform's own apps.
- The hub is yours to change, but keep what it does at sign-in. It asks a signed-in browser before an intro link replaces its session, since any app can send a viewer to one. It sends a signed-in visitor on to an app's `next` once a visit, so an app that sends them straight back can't loop. And the launcher checks the session as it polls, so signing out in another tab shows the sign-in page. `apps/hub/src/sign-in.test.tsx` and `launcher.test.tsx` cover each.
- `packages/` holds code the apps share, such as `packages/core-client`, which the hub and admin call core through.
- `packages/theme/theme.css` holds the install's look: its colour, radius and font variables. The hub and admin draw with Tailwind classes named after them, such as `bg-primary`, so changing a variable restyles both. Every control they draw comes from their own `ui.tsx`, which draws with the install's UI kit: shadcn on Base UI, in `packages/ui`, with its own `AGENTS.md`. Every app draws with it too.
- `robkit.json` marks this folder as a robkit install, and records the stack init gave the example app. The `robkit` commands refuse a folder without it.
- An app's `package.json` may declare a `robkit` field: who may open it when core first sees it, and the emoji the launcher shows. After that, the owner sets who may open it in admin.

## The layer rule

`robkit check` enforces each rule here, and `pnpm lint` runs it. Its message names the file, the line and the rule it breaks.

- An app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.
- A shared package imports only its own files, @robkit/* packages and other shared packages/*. It never imports an app.
- An app or shared package reaches core over HTTP only, never through @robkit/core. Only `apps/core` depends on it. Postgres keeps the data side: an app's role can reach its own schema and nothing else.
- Handlers take the viewer from their adapter. No app or shared package reads the session cookie or verifies a token itself.
- An app or shared package imports no file under node_modules, dist, build, a dot-folder or a symlinked folder, since robkit check doesn't read them. Keep source out of those folders, and import a package by its name.

`robkit check` is a lint, not a boundary. It reads the source and catches an app that breaks the rule by mistake, not one written to get past it, so read an imported app's code before you install it. Three things hold an app: its database role, which reaches its own schema and nothing else; its app token's audience, its own slug; and its container's environment, which holds its own `DATABASE_URL` and none of core's secrets. Its image isn't one of them: the `Dockerfile` runs `turbo prune`, which brings in every workspace package the app's `package.json` names.

## Databases

`pnpm dev` gives each app with a `migrate` script its own schema and role, then runs that script each time the app starts. The app gets its connection as `DATABASE_URL`, with its own schema first on the search path. A Node app's `migrate` script is `robkit-migrate`, and its `src/database.ts` calls `appDatabase(schema)`, both from `@robkit/drizzle`. `robkit-migrate` applies the migrations in the app's `drizzle` folder that haven't run, and records each in the app's schema, so a second run changes nothing. A Go app's migrator does the same in Go.

## Production

Each app has a `start` script, which migrates its database if it has one and then serves, and a `build` script where it needs one. The `Dockerfile` builds any app's image, named by the `ROBKIT_APP` build argument. The image holds only the app's production dependencies, so an app's `dependencies` are what its server and `start` script import, and what only its build uses, everything Vite bundles included, goes in `devDependencies`. The hub and admin serve what Vite built, so React, the theme and the UI kit are dev dependencies there. In production, core's container gives every app its database before core starts, with a password derived from the install's secret, so each app's `DATABASE_URL` is set once on the host. An app with a `go.mod` is a Go server: its image's build fetches Go, and the image runs the binary Go built. `docs/deploy.md` describes the deploy and its one-time setup.

## Dev tools

- **ESLint and Prettier.** `pnpm lint` runs ESLint after `robkit check`. `eslint.config.js` lints with robkit's own policy, which create-robkit copied into `tooling/eslint`: a `catch` uses its error or says why not, a thrown `Error` names what failed or keeps its `cause`, parsed JSON goes through a reader rather than a cast, and an `eslint-disable` says why after `--`. Each message says what to do. `pnpm format` formats the install with Prettier, and CI fails on a file Prettier would change.
- **Vitest.** Each test sits beside the code it covers, as `<name>.test.ts`, and `pnpm test` runs every package's tests. In a test, `fakeCore` from `@internal/core-client/fake-core` answers for core.
- **Go.** A React + Go app's server is Go, so building, running and checking it needs Go 1.26 or later on your `PATH`. `pnpm dev`, init and `robkit add` say how to install it when it's missing. `pnpm lint` runs the app's `gofmt`, `pnpm typecheck` its `go vet` and `tsc`, and `pnpm test` its `go test` and then the page's Vitest tests, and CI sets Go up when an app has a `go.mod`.
- **turbo.** `pnpm build`, `lint`, `typecheck` and `test` run each package's script through turbo, which answers a task from its cache when nothing it reads has changed. In `turbo.json` each task depends on `transit`, a task no package runs, which depends on `transit` in every workspace package the package uses. So an edit to `packages/theme` or `packages/core-client` builds and tests again every app that uses it. Give a new task the same `dependsOn`.
- **Husky and lint-staged.** Before each commit, a hook in `.husky/pre-commit` runs lint-staged, which runs what `lint-staged.config.js` names on the staged files and refuses the commit if any of it fails. It formats staged Go files with `gofmt`. `pnpm install` sets the hook up.
