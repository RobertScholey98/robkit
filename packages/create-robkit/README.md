# create-robkit

`npm create robkit` and the `robkit` command. Init writes an install: core, the hub, admin, one Postgres and an example app. Inside an install, `robkit` adds apps, checks the layer rule, and deploys to Coolify.

People making an install run init once. Every install takes `create-robkit` as a dev dependency and runs `robkit` through its `pnpm robkit` script. robkit's whole-stack test calls `init` directly.

## Example

The packages aren't on npm yet, so make an install from a checkout of this repo:

```sh
pnpm install
pnpm create-install                                  # asks for a folder and the example's stack
pnpm create-install ../my-install --stack start      # or asks nothing
```

`pnpm create-install` runs `src/bin.ts --link --install`: it links the install's `@robkit/*` packages to this checkout, initialises git and installs dependencies. Once the packages are on npm, `npm create robkit my-install -- --stack start --install` will do the same without the checkout.

Inside an install:

```sh
pnpm robkit add                                       # asks for the name, stack, who may open it and an icon
pnpm robkit add notes --stack react-hono --access roles --roles Family --icon 📝
pnpm robkit check                                     # the install's layer rule; pnpm lint runs it
pnpm robkit vendor                                    # packs the linked packages into vendor/robkit
```

`robkit database-urls` and `robkit deploy` are for production. The install's `docs/deploy.md` is the runbook for both.

From code, as the whole-stack test does (`tooling/e2e/src/install.ts`):

```ts
import { init } from "create-robkit";

await init({ exampleStack: "start" }, "/tmp/my-install", {
  link: true,
  install: true,
});
```

## Exports

| Export                                                                       | What it is                                                                                     |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `create-robkit` (bin)                                                        | Init. Flags: `--stack <name>`, `--install`, `--link`                                           |
| `robkit` (bin)                                                               | `add`, `check`, `vendor`, `database-urls` and `deploy`, run inside an install                  |
| `init(choices, dir, options)`                                                | Generates and writes an install, then with `install` initialises git and installs dependencies |
| `Choices`, `defaultChoices`                                                  | What init asks: `{ exampleStack }`. The default is `start`                                     |
| `stacks`, `readyStacks`, `stackFrom`, `Stack`                                | The stacks: `start` (TanStack Start) and `react-hono` (React with Hono)                        |
| `deploymentOf(...)`, `AppDeployment`, `DeploymentOptions`, `DeploymentValue` | Each app's Coolify variables, as `robkit deploy` sets them                                     |

## What it must never do

- Ask for more than the folder and the example's stack. Every install has the same tooling ([ADR 0009](../../docs/adr/0009-one-opinionated-stack.md)).
- Touch the network at init. The UI kit is committed shadcn output, which `pnpm --filter create-robkit shadcn-kit` regenerates.
- Do more than write files in `robkit add`. The next `pnpm dev` provisions and starts the app.
- Lint or typecheck the templates as robkit's own code. They are an install's files, and the whole-stack test checks them in a generated install.

## For contributors

### Init

- Every install gets the same tooling: pnpm, Drizzle, shadcn on Base UI, ESLint with Prettier, Husky with lint-staged, and Vitest.
- Init asks only for the folder and the example app's stack. It ends by printing the flags that make the same install: `--stack`, and `--install` and `--link` when it was given them.
- `init` in `src/init.ts` is the one operation from choices to a finished install: generate, write, then with `install` initialise git and install dependencies, in that order, so Husky's postinstall finds the repository. The command line and the whole-stack test both call it.
- The generator reads `base` in memory, mounts the example's stack at `apps/example`, writes the catalog from robkit's own, covering every stack, and records the example's stack in `robkit.json`.
- Every install of one robkit version has the same `packages/ui`, `packages/theme`, `packages/core-client` and catalog.

### The templates

- `src/choices.ts` lists the stacks: the ready ones, then the ones coming later, which the wizard shows but can't pick. A new stack is one entry there plus its folder, `templates/stacks/<name>`. Every install offers every ready stack.
- `templates/base` is the install itself: core, Compose, turbo, the hub and admin, `packages/core-client`, `packages/theme`, `packages/ui`, the ESLint, Prettier, lint-staged and Husky config, the Dockerfile, the CI workflow and the install's root `AGENTS.md`.
- `templates/stacks/<name>` is one app, with its Drizzle schema, migrations and `migrate` script, and its own `AGENTS.md`.
- The templates are an install's own files: the install lints and tests them, so robkit's ESLint and TypeScript skip them.
- The Dockerfile builds an app in a turbo-pruned workspace, then deletes every `node_modules` and installs only that app's production dependencies, and runs it on the Node image without npm, Yarn or Corepack. So an app's `dependencies` are what its server imports, and what Vite bundles is a dev dependency: the hub's and admin's React, theme and UI kit.
- The hub and admin call core only through `callCore` from the install's `packages/core-client`, whose `fakeCore` their tests answer from.

### Change a template

The hub, admin and core-client are template files, not packages of this repo. Init copies them into each install, so a change shows up only in installs made after it.

| What            | Where, under `templates/`                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------- |
| The hub         | `base/apps/hub/src/`: the launcher (`launcher.tsx`), sign-in forms and `core-api.ts`              |
| Admin           | `base/apps/admin/src/client/` for its screens, and `src/server.ts` for its server                 |
| core-client     | `base/packages/core-client/src/`: `call-core.ts`, and `fake-core.ts`, which the tests answer from |
| Core's app      | `base/apps/core/src/`, which starts `@robkit/core`                                                |
| The example app | `stacks/<stack>/`, mounted at `apps/example`                                                      |

An install's paths match the template's: `templates/base/apps/hub/src/launcher.tsx` becomes `apps/hub/src/launcher.tsx`. The one exception is `.gitignore`, which the template keeps as `gitignore` because npm would drop it from the package.

To change one:

1. **Make a linked install** from the root of your checkout:

   ```sh
   pnpm create-install ../try --stack start
   ```

2. **Make the change in the install first**, where you can run it. Check it there with no Docker:

   ```sh
   cd ../try
   pnpm turbo run test --filter=@internal/hub-app --filter=@internal/admin-app --filter=@internal/core-client
   pnpm lint
   pnpm typecheck
   ```

   These take seconds. `pnpm dev` shows the change in a browser, but it starts Postgres in Docker.

3. **Copy the changed files back** into the template, from the root of your checkout:

   ```sh
   cp ../try/apps/hub/src/launcher.tsx packages/create-robkit/templates/base/apps/hub/src/launcher.tsx
   ```

4. **Update create-robkit's tests.** `generate.test.ts` keeps a digest of every file init writes, so any template change fails it. Check that the files it names are the ones you changed, then update the snapshot and run the package's tests:

   ```sh
   pnpm --filter create-robkit exec vitest run src/generate.test.ts -u
   pnpm --filter create-robkit test
   ```

5. **Add a changeset** for create-robkit: a template change needs one, as a change to `src` does.

CI's whole-stack test then makes fresh installs from the templates and drives their hub, admin and apps in Chromium. On the Start install it also runs the install's own CI workflow: lint, typecheck and tests.

### The robkit command

The package's second command, `robkit`, runs in an install, which takes create-robkit as a dev dependency.

- `robkit check` is the install's layer rule, and the install's `lint` script runs it.
- `pnpm robkit add` adds an app. `addApp` in `src/add.ts` writes `apps/<slug>` on any ready stack, through the same `appFiles` the generator mounts the example with, or from the install's own `robkit/templates/<stack>` folder, which replaces robkit's template whole. It writes files only. The generator catalogs every stack's dependencies, so an added app needs no new versions.
- `robkit vendor` packs the packages a linked install uses into its `vendor/robkit`, so it builds without the checkout until the packages are on npm.
- `robkit database-urls` prints each app's production `DATABASE_URL`.
- `robkit deploy` deploys the install to Coolify. `src/coolify-config.ts` reads `coolify.json`, `src/coolify-api.ts` makes each request to Coolify, `src/coolify-deploy.ts` syncs the apps and deploys them in order, and `deploymentOf` in `src/deployment.ts` works out each app's variables.

### The UI kit

- The UI kit is shadcn on Base UI, in the install's `packages/ui`. It is shadcn's own output, committed rather than run at init, so init needs no network and its output is stable.
- `pnpm --filter create-robkit shadcn-kit` regenerates it with the cataloged shadcn CLI and checks the dependencies shadcn adds are cataloged.
- `packages/theme/theme.css` holds the install's tokens, shadcn's variables, and only it sets them. The hub and admin draw with Tailwind classes named after them.
- The hub's and admin's screens draw every control through their app's `ui.tsx`, which draws with `packages/ui`.
- Every app draws with the kit too, the example and each one `robkit add` makes.
