---
"@robkit/input": patch
---

`readDomain` lower-cases the domain it reads, so `ROBKIT_DOMAIN=Robkit.dev` works as `robkit.dev` rather than starting cleanly and then refusing every request.
