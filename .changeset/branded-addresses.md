---
"@robkit/input": patch
"@robkit/session": patch
"@robkit/core": patch
---

Core's origin and an install's domain are brands that only their readers make.

- `readCoreUrl` returns a `CoreOrigin`, keeping the origin alone and refusing one whose domain isn't a domain. `readDomain` returns a `Domain`, and checks its fallback too.
- `requestGuard`'s `core` takes a `CoreOrigin`, so it no longer checks core's address when it starts. `coreInstall(core)` in `@robkit/session/addresses` gives the install core is on.
- Core's config holds its domain as a `Domain`.
