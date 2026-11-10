---
"@robkit/core": patch
---

Core's stop no longer waits on a query that is still running. Once the server has stopped, core gives its database connections 1 second to finish and then closes them, so `docker stop` gets exit code 0 and `core stopped` before Docker's 10 seconds run out.
