# 0012: Only the proxy may reach core

**Status:** accepted, 2026-11-03 (R). Source: [The sign-in limit sees each visitor behind a tunnel](../../.scratch/v0.1-build/issues/30-sign-in-limit-behind-a-tunnel.md)

## Context

Core limits sign-in attempts per visitor, so it needs each visitor's address. Behind a proxy, every request comes from the proxy, and the visitor's address is in a header anyone could forge.

## Decision

Core trusts the last `X-Forwarded-For` entry, or `CF-Connecting-IP` when `ROBKIT_TRUSTED_PROXY=cloudflare` says only a Cloudflare tunnel reaches the host. That is safe only if nothing but the proxy reaches core, so core listens on 127.0.0.1 unless `HOST` is set.

## Consequences

- In production, set `ROBKIT_TRUSTED_PROXY=cloudflare` only when nothing but the tunnel reaches the host. The install's `docs/deploy.md` says so.
- Any container on Coolify's network can reach core directly and send its own headers. Only the owner's apps run there. The map lists this as a known gap.
- The sign-in limit is soft: two attempts racing in parallel can both get past it.
