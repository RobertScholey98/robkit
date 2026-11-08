---
"create-robkit": patch
---

React + Go is a ready stack. `npm create robkit -- --stack go` makes the example app on it, `robkit add --stack go` adds one, and both wizards offer it. The app is a Go server guarded by robkit's Go module, `github.com/RobertScholey98/robkit/go`, that serves a React page built with Vite and an API under `/api`. It owns its database: pgx, and SQL migrations embedded in the binary. Its `go.mod` reaches robkit's module with a `replace`: the checkout's `go` folder in an install made with `--link`, and `vendor/robkit/go` otherwise.
