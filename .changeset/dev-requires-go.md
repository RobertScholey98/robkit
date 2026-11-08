---
"@robkit/dev": patch
---

`pnpm dev` checks for Go before it starts anything when an app has a `go.mod`, and says how to install it if `go` won't start. `@robkit/dev/cli` exports the check as `requireGo`.
