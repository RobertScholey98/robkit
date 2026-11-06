---
"create-robkit": patch
---

`robkit vendor` builds every linked package with one pnpm and packs them with another, instead of two pnpm processes a package, and refuses an override whose name isn't a package name.
