---
"@robkit/core": patch
---

Core's log holds no query values. A database error is logged as its SQL, which has placeholders, with Postgres's SQLSTATE code, severity and the names of the schema, table, column and constraint. Its parameters, and Postgres's message and detail, which can quote a value, are left out. So a fault during sign-in or setup no longer writes an access code or the owner's password hash into core's log. This holds for a database error anywhere in a fault's chain, from a route, `/status` and core's start-up.
