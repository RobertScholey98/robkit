# robkit

robkit is a self-hosting kit. `npm create robkit` scaffolds an install, and `robkit add` adds apps with auth, a database schema and a subdomain built in.

- Domain terms are in `GLOSSARY.md`. Use them in code, tests, tickets and commits.
- The plan is `.scratch/kit/map.md`. Build tickets are in `.scratch/v0.1-build/issues/`, numbered in build order.
- The spec is the Claude Doc "robkit v0.1 spec" (https://claude.ai/artifact/MrC9JDG3NK2tSw7h6x2VV5). Where a ticket and the spec disagree, the ticket is newer and wins.

## Docs

- `README.md`: what robkit is, and the quickstart.
- `CONTRIBUTING.md`: setting up (WSL on Windows), the gates, a worked first change, tickets, branches and commits.
- `docs/architecture.md`: the request flow, the token flow, the package map, and where each concern lives.
- `docs/testing.md`: tests that start Docker, the whole-stack test, the production test, and what each prints when it fails.
- `docs/adr/`: one short record per settled decision, each linking the ticket that made it.
- `docs/conventions/input.md`: how robkit reads a value from outside its own code.
- `docs/conventions/errors.md`: expected failures, unexpected faults, and what a boundary does with each.
- `packages/<name>/README.md`: each package's purpose, example, exports and layer rule.
- `SECURITY.md`: reporting a vulnerability, and the trust model.

## Commands

```sh
pnpm install                              # Node 24, pnpm 11
pnpm create-install                       # asks for a folder and the example's stack, then makes and installs an install linked to this checkout; pnpm dev in it
pnpm check                                # the fast gate: format check, lint, typecheck and every test that needs no Docker
pnpm check:all                            # the full gate, what CI runs; needs Docker
pnpm turbo run lint typecheck test        # lint, typecheck and every test; needs Docker
pnpm format                               # Prettier
pnpm --filter <package> test              # one package, with its coverage thresholds
pnpm changeset                            # a change to a published package's src needs one; CI checks
pnpm --filter @internal/repo-checks api:update  # rewrite the API reports after an intended API change; commit them with it
pnpm --filter @internal/e2e test:production  # the default install in Docker over https; CI runs it on main, nightly and PRs labelled production
```

## create-robkit: init

`packages/create-robkit` is `npm create robkit`.

- Every install gets the same tooling: pnpm, Drizzle, shadcn on Base UI, ESLint with Prettier, Husky with lint-staged, and Vitest.
- Init asks only for the folder and the example app's stack. It ends by printing the flags that make the same install: `--stack`, and `--install` and `--link` when it was given them.
- `init` in `src/init.ts` is the one operation from choices to a finished install: generate, write, then with `install` initialise git and install dependencies, in that order, so Husky's postinstall finds the repository. The command line and the whole-stack test both call it.
- The generator reads `base` in memory, mounts the example's stack at `apps/example`, writes the catalog from robkit's own, covering every stack, and records the example's stack in `robkit.json`.
- Every install of one robkit version has the same `packages/ui`, `packages/theme`, `packages/core-client` and catalog.

## create-robkit: the templates

- `src/choices.ts` lists the stacks: the ready ones, then the ones coming later, which the wizard shows but can't pick. A new stack is one entry there plus its folder, `templates/stacks/<name>`. Every install offers every ready stack.
- `templates/base` is the install itself: core, Compose, turbo, the hub and admin, `packages/core-client`, `packages/theme`, `packages/ui`, the ESLint, Prettier, lint-staged and Husky config, the Dockerfile, the CI workflow and the install's root `AGENTS.md`.
- `templates/stacks/<name>` is one app, with its Drizzle schema, migrations and `migrate` script, and its own `AGENTS.md`.
- The templates are an install's own files: the install lints and tests them, so robkit's ESLint and TypeScript skip them.
- The Dockerfile builds an app in a turbo-pruned workspace, then deletes every `node_modules` and installs only that app's production dependencies, and runs it on the Node image without npm, Yarn or Corepack. So an app's `dependencies` are what its server imports, and what Vite bundles is a dev dependency: the hub's and admin's React, theme and UI kit.

## create-robkit: the robkit command

The package's second command, `robkit`, runs in an install, which takes create-robkit as a dev dependency.

- `robkit check` is the install's layer rule, and the install's `lint` script runs it.
- `pnpm robkit add` adds an app. `addApp` in `src/add.ts` writes `apps/<slug>` on any ready stack, through the same `appFiles` the generator mounts the example with, or from the install's own `robkit/templates/<stack>` folder, which replaces robkit's template whole. It writes files only. The generator catalogs every stack's dependencies, so an added app needs no new versions.
- `robkit vendor` packs the packages a linked install uses into its `vendor/robkit`, so it builds without the checkout until the packages are on npm.
- `robkit database-urls` prints each app's production `DATABASE_URL`.
- `robkit deploy` deploys the install to Coolify (`src/coolify.ts`, with `deploymentOf` in `src/deployment.ts` working out each app's variables).

## The UI kit

- The UI kit is shadcn on Base UI, in the install's `packages/ui`. It is shadcn's own output, committed rather than run at init, so init needs no network and its output is stable.
- `pnpm --filter create-robkit shadcn-kit` regenerates it with the cataloged shadcn CLI and checks the dependencies shadcn adds are cataloged.
- `packages/theme/theme.css` holds the install's tokens, shadcn's variables, and only it sets them. The hub and admin draw with Tailwind classes named after them.
- The hub's and admin's screens draw every control through their app's `ui.tsx`, which draws with `packages/ui`.
- Every app draws with the kit too, the example and each one `robkit add` makes.

## Apps in an install

- Each `apps/<slug>` gets the subdomain `<slug>.robkit.localhost`.
- A slug is lowercase letters and digits, starting with a letter. `readSlug` in `@robkit/session/addresses` holds the rule and is the only maker of the `Slug` brand, which every function that puts a slug into a token, SQL or an address takes.
- An app with a `migrate` script gets its own schema and role from the provision step, `provisionApps` in `@robkit/dev`, which then runs that script. `pnpm dev` runs the step before it starts the apps. The runner and the step run each app's scripts with pnpm.
- The dev runner tells each app its slug as `ROBKIT_APP`, and hands core the owner's apps as `ROBKIT_APPS`, a JSON list of each app's slug and what its manifest declares: the `robkit` field of its `package.json`, with who may open it (roles by name) and an emoji for the launcher.
- Core adds a new app with the rule it declares, or owner-only, and creates any role it names that the owner lacks. After that admin sets who may open it, and core keeps the owner's rule.
- The hub and admin call core only through `callCore` from the install's `packages/core-client`, whose `fakeCore` their tests answer from.

## The published packages

`packages/` holds the published `@robkit/*` packages.

- In this workspace their exports point at `src`. Each also builds to `dist` with `tsconfig.build.json`, and `publishConfig` points the packed package there, because Node won't strip types under `node_modules`. A repo check packs each one and fails on an export that isn't JS.
- `@robkit/core`, the backend. `createApp` takes `logError`, `console.error` by default, where every unexpected error (one handler, `app.onError`, answering a generic 500) and an unreachable database are logged.
- `@robkit/guard`, the pure guard, and `conformance.json`, the cases the guard and every adapter pass, tokens for another app, for core and with no audience among them.
- `@robkit/hono`, the Hono adapter.
- `@robkit/start`, the TanStack Start adapter. It wraps the app's server entry, so routes and server functions get the viewer as `context.viewer`.
- `@robkit/react`, the client helper. Its `sessionFetch` sends the browser through the app's `/_robkit/refresh` and core when a call finds the app's token lapsed, and hands every other answer to the caller.
- `@robkit/dev`, the `robkit-dev` runner and proxy behind an install's `pnpm dev`.
- `@robkit/session`: see below.

### @robkit/session

`@robkit/session` holds the session token's claims and cookie, and `requestGuard`, which runs the guard on a web-standard `Request` for the server adapters.

- No cookie goes on the parent domain.
- Core's own token has the audience `core` and sits in a host-only cookie on core's host, and core reads no other.
- Each app, admin included, holds its own app token, with its slug as the audience and no session id, in a host-only cookie on its own host. `requestGuard` takes the slug as `app` and accepts no other token.
- A page load it holds nothing for goes to core's `/refresh` with a random state, and core sends the browser back to the app's `/_robkit/session` with a token for that app, or none if nobody is signed in.
- The guard answers that callback, and `/_robkit/refresh`, where a call whose token lapsed sends the browser, itself, so the adapters and the app's code never see them.
- It fetches core's public key once, so apps verify tokens locally, and keeps an app's access rule from core for a minute.
- When it can't check a request it answers 503 and tells `onUnavailable` why: what failed (`core-key`, `access-rule` or `network`) and the cause. By default that logs the app, what failed and the cause.
- `@robkit/session/lapsed` is the guard's 401 for a call whose session has lapsed, which `sessionFetch` reads. It imports nothing, so the browser can load it.
- `@robkit/session/input` holds the readers for input from outside robkit's own code: environment variables, JSON and an app's `robkit` field. Each returns the value or an `InputProblem`.
- `@robkit/session/addresses` turns an install's domain into its addresses: each app on `<slug>.<domain>`, the platform apps' names, the default domain and dev port, and whether a URL is on the install. Core, the guard, the hub, admin, the dev runner, init and the whole-stack test all take their addresses from it. It imports nothing either.

## Tooling

`tooling/` holds private workspace packages:

- the shared tsconfig and the shared ESLint config;
- repo checks that run as tests;
- a per-suite test Postgres (see `docs/testing.md`);
- `@internal/test-session`, which signs session tokens and runs a fake core for the guard's and adapters' tests;
- the whole-stack test.

## The layer rule

`tooling/eslint` enforces each rule here, and its error names the rule. A new rule goes in with its lint rule, in the same commit.

- `@robkit/session` and `@robkit/guard` import no framework, and the guard does no I/O.
- Adapters (`@robkit/hono`, `@robkit/start`, `@robkit/react`) import session and guard, never core. Code reaches core over HTTP only.
- Core's tables live in the `core` schema, declared with `core.table()` in `packages/core/src/schema.ts`.
- An install has its own layer rule, for its apps and shared packages. `robkit check` (`src/check.ts` in create-robkit, one row per rule) is its only implementation. The install's `lint` script runs it, then ESLint.
- Only the proxy may reach core, because core trusts `X-Forwarded-For` for its sign-in limit, or `CF-Connecting-IP` when `ROBKIT_TRUSTED_PROXY=cloudflare` says only a Cloudflare tunnel reaches the host. Core listens on 127.0.0.1 unless `HOST` is set.

## Conventions

- Read a value from outside robkit's own code as `docs/conventions/input.md` says, and handle failures as `docs/conventions/errors.md` says. In short: expected failures are values, faults throw with `cause`, a fixable command-line failure is a `Problem` from `@robkit/dev` (`runCommand` prints it without a stack), and every outbound request has a timeout. ESLint's `preserve-caught-error` and `robkit/no-silent-catch` enforce the `catch` part.
- `tooling/repo-checks/src/package-graph.ts` lists which workspace package may depend on which. A new edge goes there in the same commit as the `package.json` change, and a repo check fails on an edge or import it doesn't list, or on a cycle. A new published package gets an entry there and an `api-report.md`.
- A package whose tests need no Docker defines `test:unit` as well as `test`, so `pnpm check` runs them.
- Each package with tests sets coverage thresholds in its `vitest.config`. Raise them when coverage rises; CI fails a pull request that lowers one. e2e has none.
- Every `eslint-disable` gives its reason after `--`, and lint fails on one that disables nothing.
- A cast fails lint outside tests (`no-unsafe-type-assertion`). Use a reader or a type guard instead.
- An adapter-facing package (guard, session, hono, start, react) keeps a `*.test-d.ts` file saying what must and mustn't compile, and its `test` script runs `vitest run --typecheck`.
- The pre-commit hook runs ESLint's fixes and Prettier on staged files. The commit-msg hook, and CI on each commit of a pull request, check the subject with `tooling/repo-checks/src/check-commit-subjects.ts`.
- A change to a published package's `src`, tests aside, needs a changeset (`pnpm changeset`). CI's `gate` job is the one required check, and a pull request fills in `.github/pull_request_template.md`.
- Every external version lives in the catalog in `pnpm-workspace.yaml`, and manifests say `catalog:`. A test in `tooling/repo-checks` fails on any version pinned elsewhere. Peer dependencies are exempt.
- TypeScript stays on 6.0 until typescript-eslint supports 7.
- pnpm 11 refuses packages published in the last day. Pin an older version rather than adding an exemption.
- Relative imports use the `.ts` extension, so Node can run source files directly. ESLint enforces it.
