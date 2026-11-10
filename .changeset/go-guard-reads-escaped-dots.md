---
"create-robkit": patch
---

The Go guard that `robkit vendor` copies into an install reads `%2e` in a path segment as a dot, as a browser and `@robkit/session` do. So `/x/%2e%2e/_robkit/refresh` is the guard's own path in both ports, and a `next` or `Referer` written that way is no longer taken for an app's page.
