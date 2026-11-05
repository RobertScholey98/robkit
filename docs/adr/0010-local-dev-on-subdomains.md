# 0010: Local dev runs every app on its own subdomain behind one proxy

**Status:** accepted, 2026-10-28 and 2026-10-31 (R). Source: [What does one-command local dev look like?](../../.scratch/kit/issues/10-local-dev.md)

## Context

Auth that depends on hosts and cookies breaks in subtle ways when dev and production use different URLs. Running every app in Docker locally is slow to start and loses hot reload.

## Decision

`pnpm dev` starts Postgres in Docker Compose and every app as a native process with hot reload. A proxy on port 3000 routes `<slug>.robkit.localhost` to each app's port, so URLs and cookies behave as they do in production. The `robkit-dev` runner from `@robkit/dev` starts each `apps/<slug>` itself, so the folder name is the subdomain.

## Consequences

- The default domain is `robkit.localhost`, because Chromium and Firefox reject a cookie for `localhost` itself.
- `pnpm dev` needs Docker, and Linux or macOS. On Windows, use WSL.
- Vite prints `http://127.0.0.1:<port>`, which shows nothing, since each app answers only on its subdomain.
- Local dev doesn't work in Safari, because WebKit doesn't send the cookie on the hub's fetch to core.
