---
"create-robkit": patch
---

`robkit vendor` copies robkit's Go module into `vendor/robkit/go` only when the install has a React + Go app, as init and `robkit upgrade` do. In an install with none, it removes a copy an earlier run left. `robkit add` still writes the module with the first Go app.
