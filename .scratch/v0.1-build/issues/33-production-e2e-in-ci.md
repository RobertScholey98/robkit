# 33: Run the production e2e in CI

**What to build:** `pnpm --filter @internal/e2e test:production` builds the default install's images and takes the guest journey over https behind Caddy. Today it runs only by hand. After this ticket robkit's CI runs it on every push to `main` and nightly, and a pull request can ask for it with a label. Image builds reuse a BuildKit cache between runs.

**Blocked by:** 11

**Status:** done

- [x] A push to `main` runs the production e2e, and a failure fails the run
- [x] A pull request labelled `production` runs it too
- [x] A second run with no install changes reuses cached image layers

Source: the build of ticket 11 (2026-11-03)

## Comments

- From ticket 34: the production stack makes its own Docker network and starts containers on it, and its journey redeploys an app while the browser is open. On CI's runner each network and container adds host interfaces, which makes Chromium fail in-flight requests with `ERR_NETWORK_CHANGED`. Start every container the journey needs before the browser opens a page, or keep the browser out of the way of those changes, and read the failed journey's browser log if a page never draws.
- **Done** (chosen in the build, awaiting R's review):
  - `.github/workflows/production.yml` runs `test:production` on each push to `main`, from `nightly.yml`, and on pull requests: on `opened`, `synchronize`, `reopened` and `labeled`, but only once the pull request carries `production`, and adding another label doesn't start it again. `tooling/matrix/src/workflows.test.ts` checks the triggers and the guard. The push to `main` can't be proven before merge; the same job proved itself on PR #33.
  - One job per install, picked by `E2E_PRODUCTION_INSTALL` (`default`, `prisma`, `kysely-on-bun`), with `fail-fast: false` and nothing allowed to continue on error, so a failing install fails the run and names itself. The concurrency group is per job, so a skipped run never cancels a running one.
  - Image layers stay in GitHub's cache: `ROBKIT_BUILD_CACHE=type=gha` makes each image build with buildx (`docker/setup-buildx-action`, with `crazy-max/ghaction-github-runtime` handing it the cache token), one cache scope per install and app, `mode=max`. Each build prints how many of its Dockerfile steps came from the cache. Locally, unset, builds use Docker's own cache as before.
  - Two things broke it on GitHub's runner and not in WSL. The apps run as `node` (uid 1000) and couldn't read Caddy's root certificate, which `docker cp` copies as 0600 for the runner's user (uid 1001), so admin couldn't reach core over https; the copy is now 0644. And Chromium still saw `ERR_NETWORK_CHANGED` right after containers started, because a new veth keeps changing the host's interfaces for a moment after its container is up; each journey's launch now waits until `ip -o link` and `ip -o addr` have stayed the same for 3 seconds.
  - A failed production journey prints what the browser saw and each container's state and last 40 log lines. `test:production` hands its prefix to `removeWhenGone`, which now removes images named `<prefix>/…` too; a run killed mid-deploy left nothing behind.
  - On PR #33: the first green run took 5m04s, 6m48s and 5m31s (default, Prisma, Kysely on bun), with `example` and `later` built cold. Its rerun took 2m38s, 3m02s and 2m57s, and every image reused 15 to 17 of its 17 or 18 steps. One step a run misses is the prune stage's `COPY . .`; the steps after it still hit, because the pruned output is the same.
