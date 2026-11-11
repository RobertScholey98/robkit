---
"create-robkit": patch
---

The install's `docs/deploy.md` no longer says the catalog holds each app's address. Without TLS in front, what points nowhere is `ROBKIT_CORE_URL`, the https address each app takes core's address and its own from. The catalog holds each app's slug, rule and icon. `robkit upgrade` doesn't rewrite that file, so change the sentence by hand if you want it.
