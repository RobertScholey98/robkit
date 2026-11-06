# Testing

This page covers the suites that start Docker: what they do, how they clean up, and what each prints when it fails. [CONTRIBUTING.md](../CONTRIBUTING.md#check-your-work) says which gate runs which tests and how to run one package's.

## Tests that start Docker

The tests in `@internal/e2e` and `@internal/test-postgres` start their own Postgres containers, and so do core's and dev's `*.db.test.ts` files. Core and dev run those in a `db` Vitest project, with the Postgres global setup and longer timeouts; their other tests are the `unit` project, which `test:unit` and `pnpm check` run.

- Each suite gets its own test Postgres from `tooling/test-postgres`, whose data stays in memory (`in-memory.yaml`, added to `COMPOSE_FILE` by `testComposeFiles()`).
- A test registers what it starts with `removeWhenGone`: a detached watcher removes its Compose project and stops every process carrying its `ROBKIT_TEST_TAG` once the test process exits, however it ends, so a failed or interrupted gate leaves nothing running.
- A Postgres port comes from `freePostgresPort()`, which also skips the ports Docker already publishes, because Docker Desktop publishes them from its own VM where `freePort()` can't see them.
- Where Docker runs natively on Linux, as on CI, set `COMPOSE_FILE` as `.github/workflows/ci.yml` does, so every test Postgres runs on the host's network: each new compose network otherwise adds host interfaces, and Chromium fails its in-flight requests with `ERR_NETWORK_CHANGED`. Docker Desktop keeps its networks in its own VM, so the suite in WSL with Docker Desktop doesn't need it.
- In WSL, if Docker can't pull images because of Docker Desktop's credential helper, point `DOCKER_CONFIG` at a folder with an empty `config.json`. CONTRIBUTING's WSL steps show how.

## The whole-stack test

`@internal/e2e`'s `test`, in `tooling/e2e/src/`.

- It generates two installs linked to this checkout, one with its example app on each stack, and in each adds an app on the other stack with `robkit add`.
- It takes a browser through each install's example and added app in Chromium. It needs Chromium once: `pnpm --filter @internal/e2e exec playwright install --with-deps chromium`.
- On the Start install it also runs the install's own CI workflow on a `PATH` that can't see any `node_modules/.bin`, checks that `pnpm lint` catches a cross-app import, and checks that the pre-commit hook refuses a commit that breaks the layer rule.
- axe checks every install's hub, admin and apps. A theme journey changes the theme's variables on the hub and checks its controls follow them.
- CI's job summary lists how long it took, beside each package's tests.

## The production test

`pnpm --filter @internal/e2e test:production`.

- It vendors the default install, builds each app's image from the install's Dockerfile, and runs the journey over https behind Caddy on `robkit.test`.
- Caddy stands in for a Cloudflare tunnel into Traefik: it names each visitor in `CF-Connecting-IP` and hands every request through one hop, and two visitor containers check that core's sign-in limit counts them apart.
- It runs `src/extraneous-packages.js` in every image it builds, and fails on any installed package the app doesn't reach through its production dependencies.
- The images build with Husky's postinstall and no git.
- It takes about nine minutes and runs on its own. `production.yml` runs it in CI on every push to `main`, from `nightly.yml`, and on a pull request labelled `production`.
- With `ROBKIT_BUILD_CACHE` set to a BuildKit cache backend (`type=gha` in CI), each image builds with buildx and keeps its layers there, one scope per app, and every build prints how many of its steps were cached.
- No container starts or stops while a journey's browser is open, and each launch first waits until the host's interfaces have stayed the same for 3 seconds, since a container that just started keeps changing them for a moment.
- The stack hands its prefix to `removeWhenGone`, which also removes the images it built.

## When a test fails

- **Rerun it alone** before you change code: `pnpm --filter <package> exec vitest run <file>`. Under load, a test can fail for reasons that aren't the code. In WSL, Node 24 occasionally crashes under a heavy gate; rerun before you blame the change.
- **A whole-stack journey prints what its browser saw** when it fails: console errors, failed requests, every 4xx and 5xx answer, each open page's text, and what the dev runner said meanwhile. Start with that output.
- **Screenshots.** Set `E2E_SCREENSHOTS=<folder>` and the whole-stack test saves each page it checks there:

  ```sh
  E2E_SCREENSHOTS=/tmp/shots pnpm --filter @internal/e2e test
  ```

- **A failed production journey** prints what the browser saw and each container's state and last logs.
- **Leftover containers.** The watcher removes what a test started when the test process exits, however it ends. If a machine crashed mid-run, `docker ps` shows any `robkit-test-*` or `robkit-install-*` containers left; remove them before the next run.
- **`ERR_NETWORK_CHANGED` in Chromium** where Docker runs natively on Linux: set `COMPOSE_FILE` as above. Docker Desktop doesn't need it.
