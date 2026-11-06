# @internal/e2e

The whole-stack test and the production test. Each makes real installs from create-robkit's templates, linked to this checkout, and takes a browser through them in Chromium. It is private and never published.

Every test here needs Docker and Linux. [docs/testing.md](../../docs/testing.md) says what each suite does, what it prints when it fails, and how to clean up after a crash.

## Run it

```sh
pnpm --filter @internal/e2e exec playwright install --with-deps chromium   # once
pnpm --filter @internal/e2e test                                           # the whole-stack test
pnpm --filter @internal/e2e exec vitest run src/start.test.ts -t "signs guests in with codes"   # one journey
pnpm --filter @internal/e2e test:production                                # the production test, about nine minutes
```

Each journey waits for the stack and claims the install if nothing has, so `-t` runs any one alone.

## The whole-stack test

`src/install.ts` is the global setup. Before any suite starts, it makes two installs with `init`, one with its example app on each stack, and in each adds an app on the other stack with `robkit add`. It makes them all first because pnpm hard-links packages from one shared store: an install made beside a running `pnpm dev` touches the files under its core, and `node --watch` restarts core mid-journey.

Each suite runs `pnpm dev` in one install and takes the owner and guests through it.

| File                         | What it does                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `start.test.ts`              | The journeys on the install whose example is on TanStack Start                                                            |
| `react-hono.test.ts`         | The same journeys on the React with Hono install                                                                          |
| `install-journeys.ts`        | `describeJourneys(name)`: the stack's own tests (the hub, core, claiming the install, Ctrl-C) and every journey, in order |
| `dev-stack.ts`               | Starting and stopping `pnpm dev` for a suite: `up()` waits until every app answers, `claimed()` also claims the install   |
| `owner-journey.ts`           | The example app's guard sends the owner to sign in, back to the app, and through core's refresh                           |
| `guest-journey.ts`           | A guest signs in with an access code and opens what their roles allow                                                     |
| `role-journey.ts`            | Changing a role's apps in admin reaches the app's guard. Waits out the cached rule, so it is slow                         |
| `added-app-journey.ts`       | The app `robkit add` made answers on its own subdomain                                                                    |
| `server-function-journey.ts` | A Start server function called with an expired session goes through core's refresh                                        |
| `theme-journey.ts`           | The hub's controls follow the theme's variables                                                                           |
| `a11y-journey.ts`            | axe checks every install's hub, admin and apps                                                                            |
| `bounces.ts`, `browser.ts`   | Matchers for the pages a guard sends a browser through, and what each browser saw                                         |
| `install-checks.test.ts`     | The Start install passes its own CI workflow, its lint catches a cross-app import, and its pre-commit hook refuses one    |
| `own-ci.ts`, `clean-path.ts` | Reading the install's CI workflow, and a `PATH` that can't see robkit's own bins                                          |
| `core-app.test.ts`           | The install's `apps/core` migrates core's schema as its own step, and won't start before it                               |
| `config-problems.test.ts`    | An app with a config problem prints that problem alone and exits 1                                                        |

Each journey's test sits in its `*-journey.ts` file, beside its browser steps.

## The production test

`production.test.ts` runs with its own config, `vitest.production.config.ts`. It vendors the default install, builds each app's image from the install's Dockerfile, and runs the journey over https behind Caddy on `robkit.test`.

| File                     | What it does                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| `production.test.ts`     | The journey: claim, a guest signs in, the sign-in limit, an added app |
| `production-stack.ts`    | The host: its network, Postgres and Caddy                             |
| `production-apps.ts`     | Building and starting each app's image                                |
| `production-checks.ts`   | What the test asks of the stack                                       |
| `production-journey.ts`  | The browser steps                                                     |
| `extraneous-packages.js` | Runs inside each image and fails on a package the app doesn't reach   |

CI runs it on every push to `main`, nightly, and on a pull request labelled `production`.
