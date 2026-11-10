---
"create-robkit": patch
---

Each stack's `AGENTS.md` says the guard refuses a write from another origin, to change state only on POST, PUT, PATCH or DELETE, and where that stack's gaps are. Start's says a server function that changes state must say `method: "POST"`, and a loader must change nothing. The Go guard that `robkit vendor` copies into an install refuses the same writes as `@robkit/session`.
