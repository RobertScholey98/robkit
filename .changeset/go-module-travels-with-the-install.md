---
"create-robkit": minor
---

An install that isn't linked to a robkit checkout holds robkit's Go module in `vendor/robkit/go`. init writes it with a Go example, and `robkit add` with the first Go app, so a Go app builds without fetching robkit's module. Its other modules still come from the Go proxy.
