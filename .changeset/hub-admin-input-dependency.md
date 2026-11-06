---
"create-robkit": patch
---

An install's hub and admin list `@robkit/input` under `dependencies`, since their servers import it. Their production images left it out, so both stopped at start with `ERR_MODULE_NOT_FOUND`.
