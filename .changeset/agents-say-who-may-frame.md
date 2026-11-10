---
"create-robkit": patch
---

Each stack's `AGENTS.md` says the guard sends `X-Frame-Options: SAMEORIGIN`, and how that stack lets another origin frame a page with its own `frame-ancestors`. Next's says where a page and a route handler each set it, and that the app's own `X-Frame-Options` won't arrive.
