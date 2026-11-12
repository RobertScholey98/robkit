# Testing

This page covers the suites that start Docker: what they do, how they clean up, and what each prints when it fails. [CONTRIBUTING.md](../CONTRIBUTING.md#check-your-work) says which gate runs which tests and how to run one package's.

## What every package's tests run with

Each package's `vitest.config` spreads `testDefaults` from `tooling/vitest`, and a repo check fails one that doesn't. Git runs with no name or email of the machine's own, as on CI's runner, so a test that commits sets them in each repo it makes, every clone included. `expect.poll` waits up to 30 seconds rather than Vitest's one, since a process starting or a lock being taken can take seconds on a busy machine. [tooling/vitest/README.md](../tooling/vitest/README.md) says more.

## Tests that start Docker

The tests in `@internal/e2e` and `@internal/test-postgres` start their own Postgres containers, and so do core's and dev's `*.db.test.ts` files. Core and dev run those in a `db` Vitest project, with the Postgres global setup and longer timeouts; their other tests are the `unit` project, which `test:unit` and `pnpm check` run.

- Each suite gets its own test Postgres from `tooling/test-postgres`, whose data stays in memory (`in-memory.yaml`, added to `COMPOSE_FILE` by `testComposeFiles()`).
- A test registers what it starts with `removeWhenGone`: a detached watcher waits for the test process to exit, however it ends, then removes its Compose project, stops every process carrying its `ROBKIT_TEST_TAG`, deletes the temp folders it made and releases its port leases. It tries each of those even when one fails, so a failed or interrupted gate leaves nothing running and nothing in the temp folder.
- A test that runs `pnpm dev`, or a command that asks it, gives it a home of its own with `homeOfItsOwn()`, since the runner keeps its socket in `~/.robkit/run`. Docker, Corepack, pnpm and Go still find their settings and caches in the real home.
- A block of ports, for `pnpm dev`'s proxy and the apps after it, comes from `freePortBlock()`. Blocks start every 20 ports from 20000, and each is leased until the test process exits: a symlink in `$TMPDIR/robkit-port-leases`, named for the block's first port and pointing at the process's pid. Only one process can make it, so two suites on the machine never get the same block, even though their servers bind long after the probe. The watcher removes the leases of a process that exited. A block that something outside the tests holds keeps its lease, and the next of up to 50 tries takes a fresh one.
- A Postgres port comes from `freePostgresPort()`, which also skips the ports Docker already publishes, because Docker Desktop publishes them from its own VM where `freePort()` can't see them.
- Where Docker runs natively on Linux, as on CI, set `COMPOSE_FILE` as `.github/workflows/ci.yml` does, so every test Postgres runs on the host's network: each new compose network otherwise adds host interfaces, and Chromium fails its in-flight requests with `ERR_NETWORK_CHANGED`. Docker Desktop keeps its networks in its own VM, so the suite in WSL with Docker Desktop doesn't need it.
- In WSL, if Docker can't pull images because of Docker Desktop's credential helper, point `DOCKER_CONFIG` at a folder with an empty `config.json`. CONTRIBUTING's WSL steps show how.

## The whole-stack test

`@internal/e2e`'s `test`, in `tooling/e2e/src/`.

- It generates an install linked to this checkout for each stack create-robkit can make (`readyStacks`), with its example app on that stack, and in each adds an app on the next stack with `robkit add`. So every stack runs as an example and as an added app.
- Each stack's journeys run from its own file, `src/<stack>.test.ts`, which calls `describeJourneys("<stack>")` with any journey only its example has: the call from the page that Start's server function and the Go example's API make, and Next's client navigation and server action with a lapsed session. A repo check fails on a ready stack without one.
- The React + Go install needs Go on the `PATH`, as `pnpm check` does for the Go module's own tests.
- It takes a browser through each install's example and added app in Chromium. It needs Chromium once: `pnpm --filter @internal/e2e exec playwright install --with-deps chromium`.
- `src/install-checks.test.ts` runs each install's own CI workflow on a `PATH` that can't see any `node_modules/.bin`: lint, the format check, typecheck, tests and the build. It takes the jobs with no `if`, the ones a pull request runs, so the deploy job stays out. On the Start install it also checks that `pnpm lint` catches a cross-app import, and that the pre-commit hook refuses a commit that breaks the layer rule. It runs in a second install of each stack, made with the first before any suite starts, so its builds and edits never land under a running `pnpm dev`.
- It isn't the only place an install's own unit tests run. create-robkit's `src/install-checks.test.ts` runs the hub's, admin's and core-client's tests and the install's lint in a fresh install, with no Docker, so `pnpm check` covers them.
- axe checks every install's hub, admin and apps. A theme journey changes the theme's variables on the hub and checks its controls follow them.
- CI's job summary lists how long it took, beside each package's tests.

## The registry test

`src/registry.test.ts` in `@internal/e2e`, its own Vitest project beside the whole-stack test, which `test` runs too.

- It makes an install the way a new owner does: `npm create robkit@<version>` in a temp folder with no checkout above it, which installs and commits by itself, with npm's registry setting only. So create-robkit runs from its packed bin and reads what its build carried, not the checkout.
- Nothing is on npm yet, so `src/registry.ts` packs every package under `packages/` and serves them from a registry on 127.0.0.1, each published the moment it was packed. It answers only robkit's packages. Any other request it redirects to npm, which serves it as it would an owner.
- pnpm runs with `minimumReleaseAgeStrict` on, so a package under a day old fails the install unless the install exempts it. robkit's packages are seconds old, so the install passing proves its exemption, and a project without one fails.
- It adds an app on every other stack with `robkit add`, then runs the install's own `lint`, `typecheck`, `test` and `build`. The first Go app writes `vendor/robkit/go`, and the Go app builds against it with `GOPROXY=off`. A second install, with its example on Go, builds the same way.
- Last, it runs `pnpm dev` in the install and signs the owner in to the example. There `robkit-dev`, `robkit-core`, `robkit-migrate` and `robkit()` all come from installed packages, which no other test runs.
- turbo runs it after the repo checks' typecheck, which builds every published package, since it packs their `dist`.

## The upgrade test

`src/upgrade.test.ts` in `@internal/e2e`, in the same Vitest project as the registry test.

- It packs every package, then repacks each tarball a patch higher with `packNewer` in `src/newer-version.ts`. Each `@robkit/*` dependency and every version create-robkit carries moves with it, or the newer install wouldn't resolve. The newer version's lint policy and Go module each gain a line, and its create-robkit ships a `CHANGELOG.md`.
- The local registry serves both versions, and the newer is `latest`.
- It makes an install at the older version with `npm create robkit`, with its example on Go, takes one catalog entry out, lowers another and adds one of the owner's, and commits. Then it runs `pnpm robkit upgrade`, and checks the catalog, `packageManager`, `tooling/eslint`, `vendor/robkit/go`, that no file under `apps/` changed, and the changelog it printed. Last, the install installs from its lockfile, and passes its own lint, typecheck and build.

## The vendored upgrade test

`src/vendored-upgrade.test.ts` in `@internal/e2e`, in the same Vitest project as the registry test.

- It packs every package and makes an install from them with `npm create robkit`, with its example on Go. Then it does what `robkit vendor` did before it could move an install, as the robscholey.com install has it: a copy of each tarball in `vendor/robkit`, an override naming each, and the catalog left at the packed version. It installs and commits.
- A second local registry serves the same tarballs a patch higher, with `packNewer`, and not the packed version.
- It runs `pnpm robkit upgrade`, which finds the registry lacks the vendored robkit and prints a `pnpm dlx` command. It runs that command, and checks the catalog, the overrides, `vendor/robkit`, the lint policy and what it printed. Last, the install installs from its lockfile and builds.

## The production test

`pnpm --filter @internal/e2e test:production`.

- It vendors the default install, builds each app's image from the install's Dockerfile, and runs the journey over https behind Caddy on `robkit.test`. After the first deploy the owner adds an app on every other stack with `robkit add`, and a guest opens each over https.
- Caddy stands in for a Cloudflare tunnel into Traefik: it names each visitor in `CF-Connecting-IP` and hands every request through one hop, and two visitor containers check that core's sign-in limit counts them apart.
- It runs `src/extraneous-packages.js` in every image it builds, and fails on any installed package the app doesn't reach through its production dependencies.
- The images build with Husky's postinstall and no git.
- It takes about nine minutes and runs on its own. `production.yml` runs it in CI on every push to `main`, from `nightly.yml`, and on a pull request labelled `production`.
- With `ROBKIT_BUILD_CACHE` set to a BuildKit cache backend (`type=gha` in CI), each image builds with buildx and keeps its layers there, one scope per app, and every build prints how many of its steps were cached.
- No container starts or stops while a journey's browser is open, and each launch first waits until the host's interfaces have stayed the same for 3 seconds, since a container that just started keeps changing them for a moment.
- The stack hands its prefix to `removeWhenGone`, which also removes the images it built.

## When a test fails

- **Rerun it alone** before you change code: `pnpm --filter <package> exec vitest run <file>`. Under load, a test can fail for reasons that aren't the code. In WSL, Node 24 occasionally crashes under a heavy gate; rerun before you blame the change.
- **A whole-stack journey prints what its browser saw** when it fails: console errors, failed requests, every 4xx and 5xx answer, each request still loading when the browser closed, each open page's text, and what the dev runner said meanwhile. Start with that output.
- **Wait for a quiet page with `networkIdle(page)`** from `tooling/e2e/src/browser.ts`, not Playwright's `networkidle`, which lint bans. If a page goes quiet for 500 ms before its `load` event and then loads one more thing, `load` takes back the `networkidle` Playwright fired, and nothing fires it again. A Next dev page does that on a busy machine. When `networkIdle` gives up, its error names each request still loading.
- **Screenshots.** Set `E2E_SCREENSHOTS=<folder>` and the whole-stack test saves each page it checks there:

  ```sh
  E2E_SCREENSHOTS=/tmp/shots pnpm --filter @internal/e2e test
  ```

- **A failed production journey** prints what the browser saw and each container's state and last logs.
- **Leftovers.** The watcher removes what a test started when the test process exits, however it ends. If a machine crashed mid-run, the watcher died with it: `docker ps` shows any `robkit-test-*`, `robkit-e2e-*` or `robkit-prod-*` containers left, and the temp folder may hold `robkit-install-*`, `robkit-bin-*`, `robkit-caddy-*` and `robkit-newer-*` folders and leases in `robkit-port-leases`. Remove them before the next run.
- **`ERR_NETWORK_CHANGED` in Chromium** where Docker runs natively on Linux: set `COMPOSE_FILE` as above. Docker Desktop doesn't need it.
