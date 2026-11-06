---
"@robkit/input": patch
"@robkit/core": patch
"@robkit/dev": patch
"create-robkit": patch
---

The install's domain keeps its `Domain` brand from where it is read to where it is used. `createApp`'s `domain`, `install`'s `domain` and `Install.domain` are a `Domain`, which `readDomain` or `isDomain` makes; `isDomain` now narrows to it. `defaultDomain` is a `Domain`, and `installAt` finds no install for a URL whose name after the app's label isn't a domain.
