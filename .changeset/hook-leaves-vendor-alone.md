---
"create-robkit": patch
---

A new install's pre-commit hook no longer runs `gofmt` on robkit's Go module in `vendor/`, so a machine with no Go can commit `vendor/robkit`. `robkit upgrade` doesn't rewrite `lint-staged.config.js`, so in an install made before this, change its last rule by hand:

```js
"!(vendor)/**/*.go": "gofmt -w",
```
