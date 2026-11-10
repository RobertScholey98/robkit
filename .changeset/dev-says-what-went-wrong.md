---
"@robkit/dev": patch
---

The dev proxy ends a browser's request when its app dies or restarts mid-answer, rather than leave it waiting.

The dev proxy listens on `127.0.0.1`, and on `::1` where the machine has it, and on no other address.
