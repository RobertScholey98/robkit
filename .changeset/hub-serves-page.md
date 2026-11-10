---
"create-robkit": patch
---

The hub's `serve.ts` is `servePage({ name: "hub" })` from `@robkit/serve`, and its `dependencies` are that package alone. Its image holds no Hono and nothing from the guard, and its answers carry the hub's headers, with HSTS on an https install.
