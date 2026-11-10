---
"create-robkit": patch
---

`robkit add` builds the app's folder in `.robkit/`, which an install's `.gitignore` now names, and renames it into `apps/` once every file is written. An add that fails leaves nothing under `apps/`, where a half-written folder would break `pnpm dev` and `pnpm install`.
