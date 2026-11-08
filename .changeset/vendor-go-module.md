---
"create-robkit": patch
---

`robkit vendor` copies robkit's Go module from the checkout to `vendor/robkit/go`, leaving out its tests, and points each Go app's `go.mod` at the copy.
