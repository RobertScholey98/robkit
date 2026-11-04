# 33: Run the production e2e in CI

**What to build:** `pnpm --filter @internal/e2e test:production` builds the default install's images and takes the guest journey over https behind Caddy. Today it runs only by hand. After this ticket robkit's CI runs it on every push to `main` and nightly, and a pull request can ask for it with a label. Image builds reuse a BuildKit cache between runs.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] A push to `main` runs the production e2e, and a failure fails the run
- [ ] A pull request labelled `production` runs it too
- [ ] A second run with no install changes reuses cached image layers

Source: the build of ticket 11 (2026-11-03)

## Comments

- From ticket 34: the production stack makes its own Docker network and starts containers on it, and its journey redeploys an app while the browser is open. On CI's runner each network and container adds host interfaces, which makes Chromium fail in-flight requests with `ERR_NETWORK_CHANGED`. Start every container the journey needs before the browser opens a page, or keep the browser out of the way of those changes, and read the failed journey's browser log if a page never draws.
