---
"@robkit/provision": patch
---

Two provision steps can run at once, as two cores do in a rolling deploy. The one that loses a race to create a role, a schema or a grant tries that app again, up to 10 times. It takes no advisory lock.
