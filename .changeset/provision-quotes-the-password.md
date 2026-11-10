---
"@robkit/provision": patch
---

`provisionDatabase` writes the password it is given into its statement as a quoted string constant. A password with a quote in it broke the statement, which runs as a superuser. robkit's own callers pass hex, so no install was affected.
