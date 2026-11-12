---
"create-robkit": minor
---

`robkit vendor --from <checkout>` packs robkit's packages from that checkout's folder, and packs again what an earlier run packed. An install that has vendored takes a newer robkit this way, where before it had no command for it. A run now removes each tarball in `vendor/robkit` that the install no longer uses.

An install that vendored before this has a robkit that refuses `--from`. Run the checkout's robkit there once, from the install's folder:

```sh
node ../robkit/packages/create-robkit/src/robkit-command.ts vendor --from ../robkit
```
