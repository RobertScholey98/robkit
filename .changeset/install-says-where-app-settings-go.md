---
"create-robkit": patch
---

A new install's `.dockerignore` leaves out every `.env` and `.env.*` file in any folder, not only at the root, so an app's own `.env` stays out of its image. `.env.example` stays in.

A new install's `AGENTS.md`, each stack's `AGENTS.md` and `docs/deploy.md` say where an app's own settings go: `apps/<slug>/.env` under `pnpm dev`, and the app's variables on Coolify in production. They say an edit waits for the next `pnpm dev`, that a test sets the settings it needs, and that a `VITE_*` or `NEXT_PUBLIC_*` value isn't in a production image, with what to do instead.
