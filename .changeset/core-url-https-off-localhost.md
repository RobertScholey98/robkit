---
"@robkit/input": patch
"@robkit/core": patch
---

`readCoreUrl` refuses an http origin unless the install is local (`localhost` or a name under it), and says to serve the install over https. An install's redirects carry tokens in their URLs, so only a local install may run over plain http. Core and every app's guard read `ROBKIT_CORE_URL` with it.
