---
"@robkit/input": patch
---

`runCommand` prints each message of an `AggregateError` whose failures are all `CommandProblem`s, with no bug line, and exits 1.
