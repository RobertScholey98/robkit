---
"create-robkit": patch
---

The Go template's dev server drops Vite's copy of `X-Frame-Options` and `X-Content-Type-Options`, so each answer through it carries the guard's once.
