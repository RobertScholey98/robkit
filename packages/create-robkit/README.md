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

`pnpm create-install` runs `src/create-robkit-command.ts --link --install`: it links the install's `@robkit/*` packages to this checkout, initialises git and installs dependencies. Once the packages are on npm, `npm create robkit my-install -- --stack start --install` will do the same without the checkout.

Inside an install:

```sh
pnpm robkit add                                       # asks for the name, stack, who may open it and an icon
pnpm robkit add notes --stack react-hono --access roles --roles Family --icon 📝
pnpm robkit check                                     # the install's layer rule; pnpm lint runs it
pnpm robkit vendor                                    # packs the linked packages, and what they run on, into vendor/robkit
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

| Export                                                                       | What it is                                                                                                                                               |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create-robkit` (bin)                                                        | Init. Flags: `--stack <name>`, `--install`, `--link`                                                                                                     |
| `robkit` (bin)                                                               | `add`, `check`, `vendor`, `database-urls` and `deploy`, run inside an install                                                                            |
| `init(choices, dir, options)`                                                | Generates and writes an install, then with `install` initialises git and installs dependencies                                                           |
| `Choices`, `defaultChoices`                                                  | What init asks: `{ exampleStack }`. The default is `start`                                                                                               |
| `stacks`, `readyStacks`, `stackFrom`, `Stack`                                | The stacks: `start` (TanStack Start), `react-hono` (React with Hono), `express` (React with Express), `next` (Next.js) and `go` (React with a Go server) |
| `deploymentOf(...)`, `AppDeployment`, `DeploymentOptions`, `DeploymentValue` | Each app's Coolify variables, as `robkit deploy` sets them                                                                                               |

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

- `src/choices.ts` lists the stacks: the ready ones, then the ones coming later, which the wizard shows but can't pick. A new stack is one entry there plus its folder, `templates/stacks/<name>`, and its adapter and tests: [Add a stack](#add-a-stack) lists them. Every install offers every ready stack.
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

   Once the change is back in the template (step 3), `src/install-checks.test.ts` runs the same tests and lint in a fresh install made from it, with no Docker. `pnpm check` runs it, or run it alone from your checkout:

   ```sh
   pnpm --filter create-robkit exec vitest run src/install-checks.test.ts
   ```

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

CI's whole-stack test then makes fresh installs from the templates and drives their hub, admin and apps in Chromium. On every install it also runs the install's own CI workflow: lint, the format check, typecheck, tests and the build.

### Add a stack

React + Express went in this way (stacks ticket 01). What a stack knows lives in its own files: the adapter, the template folder and the stack's whole-stack test file. Nothing else branches on its name, and the lists that do name every stack are typed by `Stack`, so the next one fails to compile or a test fails until it is added.

1. **The adapter**, unless the stack's server can use one that exists. `pnpm new:package <name>` makes `packages/<name>` with its entry in `tooling/eslint/package-graph.js` and an edge from `tooling/repo-checks`. Model it on `packages/hono` or `packages/express`:
   - `guarded(options)` runs `requestGuard` from `@robkit/session` on a web-standard `Request`, and either sends its answer as it is or hands the app's handlers the viewer the way its server library does, typed.
   - `src/guarded.test.ts` runs `conformanceCases` from `@robkit/guard/conformance` against `fakeCore()` from `@internal/test-session`, checks the guard's 401 for a call, and takes a token through the guard's callback.
   - `src/guarded.test-d.ts` says what must and mustn't compile, and `test` and `test:unit` run `vitest run --typecheck --coverage`. Coverage thresholds start at 100.
   - In `package-graph.js`, `dependencies` are `@robkit/guard` and `@robkit/session`, and `devDependencies` are `@internal/test-session` and `@robkit/input`. Add the package to `tooling/eslint/layers.test.js`'s layer rule cases and to the adapters in `AGENTS.md`'s layer rule.
   - The server library, such as `express`, goes in the catalog in `pnpm-workspace.yaml`, in the adapter's `devDependencies`, and as a peer dependency. The README's example compiles from `tooling/repo-checks`, so add it there too, and to `ignoreDependencies` for `tooling/repo-checks` in `knip.jsonc`.
   - Write the README, run `pnpm --filter @internal/repo-checks api:update`, and add a changeset. Where the server library's own words are ones `GLOSSARY.md` avoids, add an exception scoped to the adapter and the template in `tooling/repo-checks/src/glossary.ts`.
2. **The template**, `templates/stacks/<name>`. Copy the closest stack's folder and keep its shape:
   - `package.json` scripts: `dev` serves on `PORT` and answers on `<slug>.<domain>` behind the dev proxy, `build` writes `dist`, `start` is `node --run migrate && <serve the build>`, plus `migrate`, `typecheck` and `db:generate`. `dependencies` are exactly what the server imports when it runs; the production image installs nothing else.
   - A page that says who is asking, records a visit through `src/visits.ts`, and links `src/styles.css`, which imports `@internal/ui/styles.css`. The whole-stack test reads its heading ("Signed in as a guest"), `data-testid="viewer-id"` and `data-testid="visits"`.
   - The Drizzle files, `AGENTS.md` for the stack (how a handler reads the viewer, serving, calling core, the database) and `CLAUDE.md`.
3. **The choice.** Add the stack to `stacks` in `src/choices.ts`, or drop its `comingLater`. Then:
   - Update the tests that list the stacks: `choices`, `usage`, `wizard`, `add-wizard` and `create-robkit-command`.
   - Add its row to `viewerOn` in `generate.test.ts`, which TypeScript asks for.
   - Name the new adapter and server library in `generate.test.ts`'s link and catalog expectations.
   - Run `pnpm --filter @internal/repo-checks api:update`: create-robkit's API report lists the stacks.
   - Add a changeset for create-robkit.
4. **The whole-stack test.** Add `tooling/e2e/src/<name>.test.ts` calling `describeJourneys("<name>")`, passing as options any journey only its example has, as Start passes `{ serverFunction: true }`. `stack-journeys.test.ts` in `tooling/repo-checks` fails until the file is there. The rest follows `readyStacks`: the suite makes an install with its example on each stack, each install adds an app on the next stack with `robkit add`, and each install runs its own CI workflow. CI runs it all on every pull request.
5. **Production.** `tooling/e2e/src/production.test.ts` adds an app on every stack but the default example's after the first deploy, builds its image, opens it over https and checks the image for packages production doesn't need. A pull request runs it once labelled `production`.
6. **Check it.** Make a linked install with `pnpm create-install ../try --stack <name>`, and in it run `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and `pnpm build`. Then run `pnpm check`, and in Linux the whole-stack test (`pnpm --filter @internal/e2e test`) and the production test.
7. **Docs.** Name the stack in this README's exports, the root `README.md`'s packages, `docs/architecture.md`'s package map and `docs/testing.md`, and add a line to `.scratch/kit/map.md`.

React + Go (stacks ticket 03) is the stack whose server isn't Node, and it differs in three places. Its guard is a Go module in `go/`, a port tested against the same cases ([ADR 0013](../../docs/adr/0013-go-guard-is-a-port.md)), rather than an adapter package. Its entry in `stacks` says `ownsDatabase`, so `generate.test.ts`'s Drizzle expectations skip it, and `toolchain: "go"`, so init and `robkit add` check for Go. And its template's `go.mod` reaches the module with a `replace` that `src/go-module.ts` points at the checkout under `--link`, and `robkit vendor` at its copy in `vendor/robkit/go`.

### The robkit command

The package's second command, `robkit`, runs in an install, which takes create-robkit as a dev dependency.

- `robkit check` is the install's layer rule, and the install's `lint` script runs it.
- `pnpm robkit add` adds an app. `addApp` in `src/add.ts` writes `apps/<slug>` on any ready stack, through the same `appFiles` the generator mounts the example with, or from the install's own `robkit/templates/<stack>` folder, which replaces robkit's template whole. It writes files only. The generator catalogs every stack's dependencies, so an added app needs no new versions.
- `robkit vendor` packs the packages a linked install uses, and the robkit packages those run on, into its `vendor/robkit`, and copies robkit's Go module to `vendor/robkit/go`, so it builds without the checkout until the packages are on npm.
- `robkit database-urls` prints each app's production `DATABASE_URL`.
- `robkit deploy` deploys the install to Coolify. `src/coolify-config.ts` reads `coolify.json`, `src/coolify-api.ts` makes each request to Coolify, `src/coolify-deploy.ts` syncs the apps and deploys them in order, and `deploymentOf` in `src/deployment.ts` works out each app's variables.

### The UI kit

- The UI kit is shadcn on Base UI, in the install's `packages/ui`. It is shadcn's own output, committed rather than run at init, so init needs no network and its output is stable.
- `pnpm --filter create-robkit shadcn-kit` regenerates it with the cataloged shadcn CLI and checks the dependencies shadcn adds are cataloged.
- `packages/theme/theme.css` holds the install's tokens, shadcn's variables, and only it sets them. The hub and admin draw with Tailwind classes named after them.
- The hub's and admin's screens draw every control through their app's `ui.tsx`, which draws with `packages/ui`.
- Every app draws with the kit too, the example and each one `robkit add` makes.
