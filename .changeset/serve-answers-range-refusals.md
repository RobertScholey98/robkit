---
"@robkit/serve": patch
---

A request for a range a file doesn't have now answers 416 with `Content-Range`, and one whose `If-Match` or `If-Unmodified-Since` fails answers 412. Each was a 500 and a fault line in the server's log.
