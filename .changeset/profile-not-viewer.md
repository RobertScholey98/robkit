---
"@robkit/core": patch
"create-robkit": patch
---

Core's `GET /session`, `POST /setup`, `POST /login` and `POST /login/code` now name who is signed in `profile`, not `viewer`: `{ state: "signed-in", profile: { kind, id, ... } }`. This changes core's HTTP contract. The hub template reads the new field, so an install's hub and core must move together. `viewer` now means only the guard's `Viewer`, what an app sees after the guard.
