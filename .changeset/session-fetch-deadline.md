---
"@robkit/react": patch
---

`sessionFetch` gives up after 30 seconds, headers and body, with a `TimeoutError`, as every request robkit sends does. A signal the caller passes, in its options or on a `Request`, still stops it sooner.
