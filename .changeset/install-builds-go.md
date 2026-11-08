---
"create-robkit": patch
---

An install builds a Go app's server in its image, fetching Go only for an app with a `go.mod`, and its CI sets Go up the same way. `pnpm lint` ends with `turbo run lint`, so each app's own lint runs, such as a Go app's `gofmt`, and lint-staged formats staged Go files.
