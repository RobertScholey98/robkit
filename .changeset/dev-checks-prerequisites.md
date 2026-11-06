---
"@robkit/dev": patch
---

`robkit-dev` checks Node, pnpm and Docker before it starts anything. Node older than 24, pnpm older than 11, no Docker, Docker not answering, or no Compose plugin each stop it with a line that says what to install or start.
