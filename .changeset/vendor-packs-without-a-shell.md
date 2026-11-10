---
"create-robkit": patch
---

`robkit vendor` runs `pnpm pack` without a shell, so it packs into an install whose path has a space, a `$` or a quote in it. pnpm's output shows as it packs, as the build's does.
