---
"@robkit/provision": patch
---

Provisioning gives each app's role its password as a SCRAM-SHA-256 verifier, so the statement that makes or changes the role never holds the password. Postgres logs a statement that fails, whole, so a provisioning run that lost a race used to leave the password in Postgres's log. Each role signs in with the same password as before.
