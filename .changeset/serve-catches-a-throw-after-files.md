---
"@robkit/serve": patch
---

A handler that throws on a request no file answered now gets a 500, as the README says. The throw happened in a file system callback, where nothing caught it, so it ended the process and every request open on it.
