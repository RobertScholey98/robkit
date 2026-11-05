# This install

This is a robkit install: a monorepo of small apps behind one sign-in. Core holds the owner, guests' access codes, roles and which apps each role may open. The hub is where people sign in and launch apps, and admin is where the owner manages codes, roles and apps. Every other folder under `apps/` is an app, on its own subdomain, with its own Postgres schema.

## Commands

```sh
pnpm dev                     # Postgres, core, the hub, admin and every app, on *.robkit.localhost:3000
pnpm robkit add              # add an app; asks for its stack, name, who can open it and an icon
pnpm robkit export <name>    # write apps/<name> as a repo of its own, in ../<name>, to share it
pnpm robkit import <repo>    # bring an exported app in, from a folder or a git URL
pnpm lint                    # robkit check, then ESLint
pnpm typecheck
pnpm test
pnpm build
pnpm robkit deploy          # deploy to Coolify; see docs/deploy.md
```

## Layout

- `apps/<slug>` is an app. Its folder name is its slug, its subdomain (`<slug>.robkit.localhost` locally) and its Postgres role and schema. A slug is lowercase letters and digits, starting with a letter. Each app has its own `AGENTS.md` for its stack.
- `apps/core` runs `@robkit/core`, the backend. `apps/hub` and `apps/admin` are the platform's own apps.
- `packages/` holds code the apps share, such as `packages/core-client`, which the hub and admin call core through.
- `packages/theme/theme.css` holds the install's look: its colour, radius and font variables. The hub and admin draw with Tailwind classes named after them, such as `bg-primary`, so changing a variable restyles both. Every control they draw comes from their own `ui.tsx`, which draws with the install's UI kit: shadcn on Base UI, in `packages/ui`, with its own `AGENTS.md`. Every app draws with it too.
- `robkit.json` marks this folder as a robkit install, and records the stack init gave the example app. The `robkit` commands refuse a folder without it.
- An app's `package.json` declares a `robkit` field, its manifest: its name, the stack it was made on, the robkit contract version it was made for, who may open it when core first sees it, and the emoji the launcher shows. After core first sees it, the owner sets who may open it in admin.

## The layer rule

`robkit check` enforces each rule here, and `pnpm lint` runs it. Its message names the rule a file breaks.

- An app imports only its own files, @robkit/* packages and shared packages/*. It never imports another app.
- An app reaches core over HTTP only, never through @robkit/core. Only `apps/core` imports it. Postgres keeps the data side: an app's role can reach its own schema and nothing else.
- Handlers take the viewer from their adapter. App code never reads the session cookie or verifies a token itself.

## Databases

`pnpm dev` gives each app with a `migrate` script its own schema and role, then runs that script. The app gets its connection as `DATABASE_URL`, with its own schema first on the search path. Write migrations so they can run again: the script runs every time. When `pnpm dev` first makes an app's schema, it then runs the app's seed, the `seed.sql` at the root of its folder if it has one, once, as the app's role. It never runs it again, and a deploy doesn't run it.

## Sharing an app

`pnpm robkit export <name>` writes `apps/<name>` as a repo of its own beside the install, in `../<name>` (`--out <folder>` to choose), and commits it with git. The repo holds the app's files, its migrations and seed, never its data, and in `shared/` a copy of the install code it uses, such as `packages/ui`, so it installs, lints, typechecks and tests on its own. Export it again to commit a change to the same repo. `pnpm robkit import <folder or git URL>` brings such a repo into `apps/<name>` (`--as <name>` to rename). Its `shared/` code maps back onto the install's own packages where they're the same; where they differ it stays in the app, as `apps/<name>/shared/*`, renamed after the app. Import refuses an app made for a robkit contract version this install can't run, a name that's taken, and an app that breaks the layer rule.

## Production

Each app has a `start` script, which migrates its database if it has one and then serves, and a `build` script where it needs one. The `Dockerfile` builds any app's image, named by the `ROBKIT_APP` build argument. The image holds only the app's production dependencies, so an app's `dependencies` are what its server and `start` script import, and what only its build uses, everything Vite bundles included, goes in `devDependencies`. The hub and admin serve what Vite built, so React, the theme and the UI kit are dev dependencies there. In production, core's container gives every app its database before core starts, with a password derived from the install's secret, so each app's `DATABASE_URL` is set once on the host. `docs/deploy.md` describes the deploy and its one-time setup.

## Dev tools

- **ESLint and Prettier.** `pnpm lint` runs ESLint after `robkit check`, with the rules in `eslint.config.js`. `pnpm format` formats the install with Prettier, and CI fails on a file Prettier would change.
- **Vitest.** Each test sits beside the code it covers, as `<name>.test.ts`, and `pnpm test` runs every package's tests. In a test, `fakeCore` from `@internal/core-client/fake-core` answers for core.
- **Husky and lint-staged.** Before each commit, a hook in `.husky/pre-commit` runs lint-staged, which runs what `lint-staged.config.js` names on the staged files and refuses the commit if any of it fails. `pnpm install` sets the hook up.
